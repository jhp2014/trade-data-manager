import { and, asc, eq, isNull } from "drizzle-orm";
import { GroupInvariantError, scopeContains } from "@trade-data-manager/market";
import type {
    Group,
    GroupItemRef,
    GroupMembership,
    GroupReader,
    GroupScope,
    GroupStore,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { groups, groupMembers } from "../schema/curation.js";
import { rowToGroup, type NameTable } from "../mappers/group.js";

/**
 * Drizzle 구현 — 그룹(사전 + 관계) + 멤버십 정션.
 *
 * **계약은 이름, 저장은 id.** 밖에서는 그룹을 이름으로 지목하고(이름은 전역 유일), 안에서는
 * surrogate id 로 FK 를 건다 — rename 이 FK 를 타고 cascade 하지 않고, 조인도 bigint 로 남는다.
 * 이름↔id 번역은 **이 클래스 안에서만** 일어난다(idOf/이름표). 밖으로 id 를 흘리면 안 되는 이유는
 * 로컬 미러와 Supabase 가 각자 id 를 발급하고 전체교체 때 로컬 id 가 통째로 갈리기 때문이다.
 *
 * DB 로는 못 막아 여기서 지키는 불변식 둘:
 *   · 항목 키의 **시각 유무**가 그룹 scope 와 맞아야 한다(하루 그룹에 타점을 넣으면 같은 하루가 여러 번 든다).
 *   · 부모 층위가 자식을 **담을 수 있어야** 하고(하루 ⊇ 타점) **순환하지 않는다**(순환하면 조회가 무한히 내려간다).
 */
export class DrizzleGroupRepository implements GroupReader, GroupStore {
    constructor(private readonly db: Database) {}

    async listGroups(): Promise<Group[]> {
        const rows = await this.db.select().from(groups).orderBy(asc(groups.name));
        const groupNames: NameTable = new Map(rows.map((r) => [String(r.id), r.name]));
        return rows.map((r) => rowToGroup(r, groupNames));
    }

    async listAllMemberships(): Promise<GroupMembership[]> {
        // 전 항목을 한 번에 — 소비자가 모두 전체를 본다. 항목 키로 접어 groupNames 배열로 낸다.
        // 조인으로 이름을 바로 가져온다(둘 다 curation 이라 물리 분리 제약이 없다).
        const rows = await this.db
            .select({
                stockCode: groupMembers.stockCode,
                date: groupMembers.tradeDate,
                time: groupMembers.tradeTime,
                groupName: groups.name,
            })
            .from(groupMembers)
            .innerJoin(groups, eq(groups.id, groupMembers.groupId))
            .orderBy(asc(groupMembers.stockCode), asc(groupMembers.tradeDate));

        const byItem = new Map<string, GroupMembership>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}|${r.time ?? ""}`;
            const hit = byItem.get(key);
            if (hit) hit.groupNames.push(r.groupName);
            else {
                byItem.set(key, {
                    stockCode: r.stockCode,
                    date: r.date,
                    ...(r.time === null ? {} : { time: r.time }),
                    groupNames: [r.groupName],
                });
            }
        }
        return [...byItem.values()];
    }

    async createGroup(name: string, scope: GroupScope): Promise<Group> {
        // 같은 이름이면 그 그룹을 돌려준다 — 중복 생성 사고를 막는 멱등(옛 태그 사전의 규칙 계승).
        const existing = await this.db.select().from(groups).where(eq(groups.name, name)).limit(1);
        if (existing.length > 0) return this.hydrate(existing[0]!);
        const [row] = await this.db.insert(groups).values({ name, scope }).returning();
        return this.hydrate(row!);
    }

    async renameGroup(name: string, newName: string): Promise<void> {
        await this.db.update(groups).set({ name: newName }).where(eq(groups.name, name));
    }

    async removeGroup(name: string): Promise<void> {
        await this.db.delete(groups).where(eq(groups.name, name));
    }

    async attach(groupName: string, item: GroupItemRef): Promise<void> {
        // id·scope 를 한 조회로 — 같은 행을 두 번 읽던 것(idOf + scopeOf)을 합쳤다.
        const { id, scope } = await this.metaOf(groupName);
        assertItemMatchesScope(scope, item);
        // 멱등 — 부분 유니크 인덱스가 grain 별로 잡고 있어 충돌하면 그냥 넘어간다.
        await this.db
            .insert(groupMembers)
            .values({
                groupId: id,
                stockCode: item.stockCode,
                tradeDate: item.date,
                tradeTime: item.time ?? null,
            })
            .onConflictDoNothing();
    }

    async detach(groupName: string, item: GroupItemRef): Promise<void> {
        const id = await this.idOf(groupName);
        await this.db
            .delete(groupMembers)
            .where(
                and(
                    eq(groupMembers.groupId, id),
                    eq(groupMembers.stockCode, item.stockCode),
                    eq(groupMembers.tradeDate, item.date),
                    item.time === undefined ? isNull(groupMembers.tradeTime) : eq(groupMembers.tradeTime, item.time),
                ),
            );
    }

    async setParent(name: string, parentName: string | null): Promise<void> {
        if (parentName === null) {
            await this.db.update(groups).set({ parentId: null }).where(eq(groups.name, name));
            return;
        }
        if (name === parentName) throw new GroupInvariantError("자기 자신을 부모로 둘 수 없다");
        const rows = await this.db
            .select({ id: groups.id, name: groups.name, scope: groups.scope, parentId: groups.parentId })
            .from(groups);
        const byName = new Map(rows.map((r) => [r.name, r]));
        const byId = new Map(rows.map((r) => [String(r.id), r]));
        const self = byName.get(name);
        const parent = byName.get(parentName);
        if (!self || !parent) throw new GroupInvariantError("없는 그룹");
        if (!scopeContains(parent.scope as GroupScope, self.scope as GroupScope)) {
            throw new GroupInvariantError(`부모 그룹의 층위가 더 좁다: ${parent.scope} 아래 ${self.scope} 는 둘 수 없다`);
        }
        // 순환 방지 — 부모를 타고 올라가다 자신을 만나면 거절(그리기가 무한히 내려간다).
        for (let cur = parent, hops = 0; cur.parentId !== null; hops++) {
            if (hops > rows.length) throw new GroupInvariantError("그룹 계층이 이미 순환한다");
            const next = byId.get(String(cur.parentId));
            if (!next) break;
            if (next.name === name) throw new GroupInvariantError("자기 자손을 부모로 둘 수 없다(순환)");
            cur = next;
        }
        await this.db.update(groups).set({ parentId: parent.id }).where(eq(groups.id, self.id));
    }

    /** 이름 → id. 계약(이름)과 저장(id) 사이의 유일한 통로 — 없는 이름은 불변식 위반으로 400 이 된다. */
    private async idOf(name: string): Promise<bigint> {
        return (await this.metaOf(name)).id;
    }

    /** 이름 → {id, scope} 한 조회 — attach 가 id(FK)와 scope(층위 검증)를 같이 쓴다. */
    private async metaOf(name: string): Promise<{ id: bigint; scope: GroupScope }> {
        const rows = await this.db.select({ id: groups.id, scope: groups.scope }).from(groups).where(eq(groups.name, name)).limit(1);
        if (rows.length === 0) throw new GroupInvariantError(`없는 그룹: ${name}`);
        return { id: rows[0]!.id, scope: rows[0]!.scope as GroupScope };
    }

    /** 행 하나를 계약 모양으로 — 부모 이름이 필요해 이름표를 함께 뜬다(몇 행 규모). */
    private async hydrate(row: typeof groups.$inferSelect): Promise<Group> {
        if (row.parentId === null) return rowToGroup(row, new Map());
        const groupRows = await this.db.select({ id: groups.id, name: groups.name }).from(groups);
        return rowToGroup(row, new Map(groupRows.map((r) => [String(r.id), r.name])));
    }

}

function assertItemMatchesScope(scope: GroupScope, item: GroupItemRef): void {
    if (scope === "day" && item.time !== undefined) throw new GroupInvariantError("하루 그룹에는 시각을 넣지 않는다(하루가 곧 멤버)");
    if (scope === "point" && item.time === undefined) throw new GroupInvariantError("타점 그룹에는 시각이 필요하다(타점이 곧 멤버)");
}
