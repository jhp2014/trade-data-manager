import { asc, eq } from "drizzle-orm";
import type { MapReader, MapScope, MapStore, SimilarityMap } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { groups, maps } from "../schema/curation.js";

/**
 * Drizzle 구현 — 평면 자체만. 점(그룹)의 좌표·부모는 `groups` 가 든다.
 * 평면을 지우면 그 위 그룹은 **내려올 뿐 사라지지 않는다**: 평면은 보는 방식이고 분류는 그것과
 * 무관하게 남아야 한다. FK 로 걸지 않고(curation 은 앱이 무결성을 관리) 한 트랜잭션에서 처리한다.
 */
export class DrizzleMapRepository implements MapReader, MapStore {
    constructor(private readonly db: Database) {}

    async listMaps(): Promise<SimilarityMap[]> {
        const rows = await this.db.select().from(maps).orderBy(asc(maps.id));
        return rows.map((r) => ({ id: String(r.id), name: r.name, scope: r.scope as MapScope }));
    }

    async createMap(name: string, scope: MapScope): Promise<SimilarityMap> {
        const [row] = await this.db.insert(maps).values({ name, scope }).returning();
        return { id: String(row!.id), name: row!.name, scope: row!.scope as MapScope };
    }

    async renameMap(id: string, name: string): Promise<void> {
        await this.db.update(maps).set({ name }).where(eq(maps.id, BigInt(id)));
    }

    async removeMap(id: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            // 먼저 내리고(좌표·부모까지 풀어) 그다음 평면을 지운다 — 순서가 바뀌면 고아 map_id 가 남는다.
            await tx.update(groups).set({ mapId: null, x: null, y: null, parentId: null }).where(eq(groups.mapId, BigInt(id)));
            await tx.delete(maps).where(eq(maps.id, BigInt(id)));
        });
    }
}
