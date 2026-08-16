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
        // id 오름차순 유지 = 만든 순서. 계약에 id 가 없어도 정렬 기준으로는 쓴다(저장소 안이라 무해).
        const rows = await this.db.select().from(maps).orderBy(asc(maps.id));
        return rows.map((r) => ({ name: r.name, scope: r.scope as MapScope }));
    }

    async createMap(name: string, scope: MapScope): Promise<SimilarityMap> {
        const [row] = await this.db.insert(maps).values({ name, scope }).returning();
        return { name: row!.name, scope: row!.scope as MapScope };
    }

    async renameMap(name: string, newName: string): Promise<void> {
        await this.db.update(maps).set({ name: newName }).where(eq(maps.name, name));
    }

    async removeMap(name: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            // 이름 → id 는 여기서만 푼다(계약은 이름, FK 는 id). 없는 이름이면 조용히 끝낸다.
            const [row] = await tx.select({ id: maps.id }).from(maps).where(eq(maps.name, name)).limit(1);
            if (!row) return;
            // 먼저 내리고(좌표·부모까지 풀어) 그다음 평면을 지운다 — 순서가 바뀌면 고아 map_id 가 남는다.
            await tx.update(groups).set({ mapId: null, x: null, y: null, parentId: null }).where(eq(groups.mapId, row.id));
            await tx.delete(maps).where(eq(maps.id, row.id));
        });
    }
}
