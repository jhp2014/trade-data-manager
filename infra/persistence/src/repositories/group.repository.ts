import { and, asc, eq, isNull } from "drizzle-orm";
import { GroupInvariantError } from "@trade-data-manager/market";
import type {
    Group,
    GroupItemRef,
    GroupMembership,
    GroupMove,
    GroupPlacement,
    GroupReader,
    GroupScope,
    GroupStore,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { groups, groupMembers, maps } from "../schema/curation.js";
import { rowToGroup } from "../mappers/group.js";

/**
 * Drizzle 구현 — 그룹(사전 + 관계 + 위치) + 멤버십 정션.
 *
 * DB 로는 못 막아 여기서 지키는 불변식 셋:
 *   · 항목 키의 **시각 유무**가 그룹 scope 와 맞아야 한다(하루 그룹에 타점을 넣으면 같은 하루가 여러 번 든다).
 *   · 평면에 올릴 때 **맵 scope == 그룹 scope**(섞이면 한 평면에서 두 층위의 겹침을 같은 선으로 그린다).
 *   · 부모는 **같은 맵**이고 **순환하지 않는다**(순환하면 중첩을 그리다 무한히 내려간다).
 */
export class DrizzleGroupRepository implements GroupReader, GroupStore {
    constructor(private readonly db: Database) {}

    async listGroups(): Promise<Group[]> {
        const rows = await this.db.select().from(groups).orderBy(asc(groups.name));
        return rows.map(rowToGroup);
    }

    async listAllMemberships(): Promise<GroupMembership[]> {
        // 전 항목을 한 번에 — 소비자가 모두 전체를 본다. 항목 키로 접어 groupIds 배열로 낸다.
        const rows = await this.db
            .select({
                stockCode: groupMembers.stockCode,
                date: groupMembers.tradeDate,
                time: groupMembers.tradeTime,
                groupId: groupMembers.groupId,
            })
            .from(groupMembers)
            .orderBy(asc(groupMembers.stockCode), asc(groupMembers.tradeDate));

        const byItem = new Map<string, GroupMembership>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}|${r.time ?? ""}`;
            const hit = byItem.get(key);
            if (hit) hit.groupIds.push(String(r.groupId));
            else {
                byItem.set(key, {
                    stockCode: r.stockCode,
                    date: r.date,
                    ...(r.time === null ? {} : { time: r.time }),
                    groupIds: [String(r.groupId)],
                });
            }
        }
        return [...byItem.values()];
    }

    async createGroup(name: string, scope: GroupScope): Promise<Group> {
        // 같은 이름이면 그 그룹을 돌려준다 — 중복 생성 사고를 막는 멱등(옛 태그 사전의 규칙 계승).
        const existing = await this.db.select().from(groups).where(eq(groups.name, name)).limit(1);
        if (existing.length > 0) return rowToGroup(existing[0]!);
        const [row] = await this.db.insert(groups).values({ name, scope }).returning();
        return rowToGroup(row!);
    }

    async renameGroup(id: string, name: string): Promise<void> {
        await this.db.update(groups).set({ name }).where(eq(groups.id, BigInt(id)));
    }

    async removeGroup(id: string): Promise<void> {
        await this.db.delete(groups).where(eq(groups.id, BigInt(id)));
    }

    async attach(groupId: string, item: GroupItemRef): Promise<void> {
        await this.assertItemMatchesScope(groupId, item);
        // 멱등 — 부분 유니크 인덱스가 grain 별로 잡고 있어 충돌하면 그냥 넘어간다.
        await this.db
            .insert(groupMembers)
            .values({
                groupId: BigInt(groupId),
                stockCode: item.stockCode,
                tradeDate: item.date,
                tradeTime: item.time ?? null,
            })
            .onConflictDoNothing();
    }

    async detach(groupId: string, item: GroupItemRef): Promise<void> {
        await this.db
            .delete(groupMembers)
            .where(
                and(
                    eq(groupMembers.groupId, BigInt(groupId)),
                    eq(groupMembers.stockCode, item.stockCode),
                    eq(groupMembers.tradeDate, item.date),
                    item.time === undefined ? isNull(groupMembers.tradeTime) : eq(groupMembers.tradeTime, item.time),
                ),
            );
    }

    async setPlacement(id: string, placement: GroupPlacement): Promise<void> {
        if (placement === null) {
            // 내리기 — 좌표도 같이 지운다(맵 밖의 좌표는 뜻이 없다). 자식들도 같이 내린다: 부모가 없는
            // 평면에 자식만 남으면 중첩이 끊긴 채 떠 있게 된다.
            await this.db.transaction(async (tx) => {
                await tx.update(groups).set({ mapId: null, x: null, y: null, parentId: null }).where(eq(groups.id, BigInt(id)));
                await tx.update(groups).set({ parentId: null }).where(eq(groups.parentId, BigInt(id)));
            });
            return;
        }
        const scope = await this.scopeOf(id);
        const mapRows = await this.db.select({ scope: maps.scope }).from(maps).where(eq(maps.id, BigInt(placement.mapId))).limit(1);
        if (mapRows.length === 0) throw new GroupInvariantError(`없는 맵: ${placement.mapId}`);
        if (mapRows[0]!.scope !== scope) throw new GroupInvariantError(`평면(${mapRows[0]!.scope})과 그룹(${scope})의 층위가 다르다`);
        await this.db
            .update(groups)
            .set({ mapId: BigInt(placement.mapId), x: placement.x, y: placement.y })
            .where(eq(groups.id, BigInt(id)));
    }

    async moveGroups(moves: GroupMove[]): Promise<void> {
        if (moves.length === 0) return;
        // 한 트랜잭션 — 여럿을 한 번에 끄는데 절반만 반영되면 화면과 DB 가 조용히 갈린다.
        await this.db.transaction(async (tx) => {
            for (const m of moves) {
                await tx.update(groups).set({ x: m.x, y: m.y }).where(eq(groups.id, BigInt(m.id)));
            }
        });
    }

    async setParent(id: string, parentId: string | null): Promise<void> {
        if (parentId === null) {
            await this.db.update(groups).set({ parentId: null }).where(eq(groups.id, BigInt(id)));
            return;
        }
        if (id === parentId) throw new GroupInvariantError("자기 자신을 부모로 둘 수 없다");
        const rows = await this.db.select({ id: groups.id, mapId: groups.mapId, parentId: groups.parentId }).from(groups);
        const byId = new Map(rows.map((r) => [String(r.id), r]));
        const self = byId.get(id);
        const parent = byId.get(parentId);
        if (!self || !parent) throw new GroupInvariantError("없는 그룹");
        if (self.mapId === null || parent.mapId === null || String(self.mapId) !== String(parent.mapId)) {
            throw new GroupInvariantError("부모는 같은 평면의 그룹이어야 한다");
        }
        // 순환 방지 — 부모를 타고 올라가다 자신을 만나면 거절(그리기가 무한히 내려간다).
        for (let cur = parent, hops = 0; cur.parentId !== null; hops++) {
            if (hops > rows.length) throw new GroupInvariantError("그룹 계층이 이미 순환한다");
            const next = byId.get(String(cur.parentId));
            if (!next) break;
            if (String(next.id) === id) throw new GroupInvariantError("자기 자손을 부모로 둘 수 없다(순환)");
            cur = next;
        }
        await this.db.update(groups).set({ parentId: BigInt(parentId) }).where(eq(groups.id, BigInt(id)));
    }

    private async scopeOf(id: string): Promise<GroupScope> {
        const rows = await this.db.select({ scope: groups.scope }).from(groups).where(eq(groups.id, BigInt(id))).limit(1);
        if (rows.length === 0) throw new GroupInvariantError(`없는 그룹: ${id}`);
        return rows[0]!.scope as GroupScope;
    }

    private async assertItemMatchesScope(groupId: string, item: GroupItemRef): Promise<void> {
        const scope = await this.scopeOf(groupId);
        if (scope === "day" && item.time !== undefined) throw new GroupInvariantError("하루 그룹에는 시각을 넣지 않는다(하루가 곧 멤버)");
        if (scope === "point" && item.time === undefined) throw new GroupInvariantError("타점 그룹에는 시각이 필요하다(타점이 곧 멤버)");
    }
}
