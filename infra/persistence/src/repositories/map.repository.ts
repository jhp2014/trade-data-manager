import { and, asc, eq, inArray } from "drizzle-orm";
import type {
    MapCorpus,
    MapPlacement,
    MapPlacementMove,
    MapReader,
    MapScope,
    MapStore,
    NewMapPlacement,
    SimilarityMap,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { maps, mapGroups, mapPlacements } from "../schema/curation.js";

/**
 * Drizzle 구현 — 맵(bigserial) + 무리(자기참조 트리) + 자리(surrogate id, 항목당 여럿).
 *
 * **scope 정합은 여기서 막는다**: day 맵에 시각이 들어오거나 point 맵에 시각이 없으면 거부한다.
 * DB 는 못 막는다(한 컬럼의 NULL 여부는 다른 테이블의 값에 걸린 제약이라 CHECK 로 안 나온다).
 * 놓치면 day 맵에 타점 자리가 섞여 같은 하루가 점 여럿으로 보이고, 그 시점엔 원인이 화면에 안 남는다.
 */
export class DrizzleMapRepository implements MapReader, MapStore {
    constructor(private readonly db: Database) {}

    async loadCorpus(): Promise<MapCorpus> {
        // 세 테이블을 각자 통째로 — 조인하면 맵·무리가 자리 수만큼 복제돼 오히려 커진다(정규화 전송).
        const [mapRows, groupRows, placementRows] = await Promise.all([
            this.db.select().from(maps).orderBy(asc(maps.id)),
            this.db.select().from(mapGroups).orderBy(asc(mapGroups.id)),
            this.db.select().from(mapPlacements).orderBy(asc(mapPlacements.id)),
        ]);
        return {
            maps: mapRows.map((r) => ({ id: String(r.id), name: r.name, scope: r.scope as MapScope })),
            groups: groupRows.map((r) => ({
                id: String(r.id),
                mapId: String(r.mapId),
                parentId: r.parentId === null ? null : String(r.parentId),
                name: r.name,
            })),
            placements: placementRows.map(rowToPlacement),
        };
    }

    async createMap(name: string, scope: MapScope): Promise<SimilarityMap> {
        const [row] = await this.db.insert(maps).values({ name, scope }).returning();
        return { id: String(row!.id), name: row!.name, scope: row!.scope as MapScope };
    }

    async renameMap(id: string, name: string): Promise<void> {
        await this.db.update(maps).set({ name }).where(eq(maps.id, BigInt(id)));
    }

    async removeMap(id: string): Promise<void> {
        await this.db.delete(maps).where(eq(maps.id, BigInt(id)));
    }

    async addPlacements(mapId: string, entries: NewMapPlacement[]): Promise<MapPlacement[]> {
        if (entries.length === 0) return [];
        const scope = await this.scopeOf(mapId);
        for (const e of entries) assertItemMatchesScope(scope, e.item.time);

        // 한 트랜잭션 안에서 한 줄씩 — 다중 INSERT 의 returning 순서는 보장 대상이 아닌데, 호출부는 응답을
        // 입력 순서로 읽어 낙관 갱신의 임시 id 와 짝짓는다. 좌표로 되짚는 건 같은 항목을 같은 자리에 두 번
        // 놓는 순간 깨지므로 순서를 처음부터 지킨다(한 번에 놓는 건 많아야 수십 개).
        return await this.db.transaction(async (tx) => {
            const saved: MapPlacement[] = [];
            for (const e of entries) {
                const [row] = await tx
                    .insert(mapPlacements)
                    .values({
                        mapId: BigInt(mapId),
                        stockCode: e.item.stockCode,
                        tradeDate: e.item.date,
                        tradeTime: e.item.time ?? null,
                        x: e.x,
                        y: e.y,
                        groupId: e.groupId == null ? null : BigInt(e.groupId),
                    })
                    .returning();
                saved.push(rowToPlacement(row!));
            }
            return saved;
        });
    }

    async movePlacements(mapId: string, moves: MapPlacementMove[]): Promise<void> {
        if (moves.length === 0) return;
        // 한 트랜잭션 — 다중선택 드래그가 절반만 반영되면 화면과 DB 가 조용히 갈린다.
        await this.db.transaction(async (tx) => {
            for (const m of moves) {
                await tx
                    .update(mapPlacements)
                    .set({ x: m.x, y: m.y })
                    .where(and(eq(mapPlacements.id, BigInt(m.id)), eq(mapPlacements.mapId, BigInt(mapId))));
            }
        });
    }

    async removePlacements(mapId: string, ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        await this.db
            .delete(mapPlacements)
            .where(and(eq(mapPlacements.mapId, BigInt(mapId)), inArray(mapPlacements.id, ids.map(BigInt))));
    }

    /** 맵의 scope — 없는 맵이면 던진다(자리가 유령 맵에 붙는 걸 여기서 끊는다). */
    private async scopeOf(mapId: string): Promise<MapScope> {
        const rows = await this.db.select({ scope: maps.scope }).from(maps).where(eq(maps.id, BigInt(mapId))).limit(1);
        if (rows.length === 0) throw new Error(`없는 맵: ${mapId}`);
        return rows[0]!.scope as MapScope;
    }
}

function rowToPlacement(r: typeof mapPlacements.$inferSelect): MapPlacement {
    return {
        id: String(r.id),
        mapId: String(r.mapId),
        item: { stockCode: r.stockCode, date: r.tradeDate, ...(r.tradeTime === null ? {} : { time: r.tradeTime }) },
        x: r.x,
        y: r.y,
        groupId: r.groupId === null ? null : String(r.groupId),
    };
}

function assertItemMatchesScope(scope: MapScope, time: string | undefined): void {
    if (scope === "day" && time !== undefined) throw new Error("day 맵의 자리에는 시각을 넣지 않는다(하루가 곧 점)");
    if (scope === "point" && time === undefined) throw new Error("point 맵의 자리에는 시각이 필요하다(타점이 곧 점)");
}
