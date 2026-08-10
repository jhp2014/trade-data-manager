import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { maps, mapGroups, mapPlacements } from "../../schema/curation.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

/**
 * 유사도 맵 스키마의 **계약** 테스트(리포지토리 이전 — 아직 없다).
 * 여기서 잠그는 건 코드가 아니라 DB 가 보장하는 것들이다. 특히 `map_placements` 의 review_points 복합 FK 는
 * **MATCH SIMPLE**(Postgres 기본)이라 참조 컬럼 중 하나라도 NULL 이면 검사를 건너뛴다 — 이 비대칭 위에
 * "day 자리는 타점 없이 살고 point 자리는 타점과 함께 죽는다"가 통째로 얹혀 있는데, 컬럼만 봐서는 안 보인다.
 */
const POINT = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };

describe("유사도 맵 스키마 (pglite)", () => {
    let t: TestDb;
    let dayMapId: bigint;
    let pointMapId: bigint;

    const placementsOf = (mapId: bigint) => t.db.select().from(mapPlacements).where(eq(mapPlacements.mapId, mapId));

    beforeEach(async () => {
        t = await createTestDb();
        await new DrizzleReviewPointRepository(t.db).upsert([POINT]);
        const [d] = await t.db.insert(maps).values({ name: "일봉", scope: "day" }).returning();
        const [p] = await t.db.insert(maps).values({ name: "분봉", scope: "point" }).returning();
        dayMapId = d!.id;
        pointMapId = p!.id;
    });
    afterEach(async () => {
        await t.close();
    });

    it("day 자리(trade_time NULL)는 타점이 없어도 들어간다 — MATCH SIMPLE", async () => {
        // 골격만 그려둔 하루도 배치 대상이다. 이 하루에 대응하는 review_point 는 없다.
        await t.db.insert(mapPlacements).values({
            mapId: dayMapId,
            stockCode: "000660",
            tradeDate: "2026-07-01",
            tradeTime: null,
            x: 1,
            y: 2,
        });
        expect(await placementsOf(dayMapId)).toHaveLength(1);
    });

    it("point 자리는 타점이 없으면 거부된다", async () => {
        await expect(
            t.db.insert(mapPlacements).values({
                mapId: pointMapId,
                stockCode: "000660",
                tradeDate: "2026-07-01",
                tradeTime: "09:30:00", // 존재하지 않는 타점
                x: 1,
                y: 2,
            }),
        ).rejects.toThrow();
    });

    it("point 자리는 타점을 지우면 함께 사라진다 (cascade) — day 자리는 남는다", async () => {
        await t.db.insert(mapPlacements).values([
            { mapId: pointMapId, stockCode: POINT.stockCode, tradeDate: POINT.date, tradeTime: POINT.time, x: 1, y: 1 },
            { mapId: dayMapId, stockCode: POINT.stockCode, tradeDate: POINT.date, tradeTime: null, x: 2, y: 2 },
        ]);

        await new DrizzleReviewPointRepository(t.db).remove(POINT.stockCode, POINT.date, POINT.time);

        expect(await placementsOf(pointMapId)).toHaveLength(0);
        expect(await placementsOf(dayMapId)).toHaveLength(1); // 차트 형태는 진입점보다 오래 산다
    });

    it("한 항목이 여러 자리를 가진다 — 징검다리(자연키가 유니크가 아님)", async () => {
        const [a] = await t.db.insert(mapGroups).values({ mapId: dayMapId, name: "얕은 눌림" }).returning();
        const [b] = await t.db.insert(mapGroups).values({ mapId: dayMapId, name: "깊은 눌림" }).returning();
        const [bridge] = await t.db.insert(mapGroups).values({ mapId: dayMapId, name: "징검다리" }).returning();

        const item = { mapId: dayMapId, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null };
        await t.db.insert(mapPlacements).values([
            { ...item, x: 1, y: 1, groupId: a!.id },
            { ...item, x: 5, y: 1, groupId: b!.id },
            { ...item, x: 3, y: 4, groupId: bridge!.id },
        ]);

        const rows = await placementsOf(dayMapId);
        expect(rows).toHaveLength(3);
        expect(new Set(rows.map((r) => r.id)).size).toBe(3); // 자리마다 고유 id
    });

    it("그룹을 지우면 멤버는 자유 배치가 된다 (SET NULL 폴백 — 부모로 올리는 건 앱의 몫)", async () => {
        const [g] = await t.db.insert(mapGroups).values({ mapId: dayMapId, name: "임시" }).returning();
        await t.db
            .insert(mapPlacements)
            .values({ mapId: dayMapId, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null, x: 1, y: 1, groupId: g!.id });

        await t.db.delete(mapGroups).where(eq(mapGroups.id, g!.id));

        const rows = await placementsOf(dayMapId);
        expect(rows).toHaveLength(1); // 자리는 살아남고
        expect(rows[0]!.groupId).toBeNull(); // 소속만 풀린다
    });

    it("중첩 그룹 — 부모를 지우면 자식은 최상위가 된다", async () => {
        const [parent] = await t.db.insert(mapGroups).values({ mapId: dayMapId, name: "눌림 계열" }).returning();
        const [child] = await t.db.insert(mapGroups).values({ mapId: dayMapId, parentId: parent!.id, name: "세부 1" }).returning();

        await t.db.delete(mapGroups).where(eq(mapGroups.id, parent!.id));

        const rows = await t.db.select().from(mapGroups).where(eq(mapGroups.id, child!.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.parentId).toBeNull();
    });

    it("맵을 지우면 그룹과 자리가 함께 사라진다", async () => {
        const [g] = await t.db.insert(mapGroups).values({ mapId: dayMapId, name: "무리" }).returning();
        await t.db
            .insert(mapPlacements)
            .values({ mapId: dayMapId, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null, x: 1, y: 1, groupId: g!.id });

        await t.db.delete(maps).where(eq(maps.id, dayMapId));

        expect(await placementsOf(dayMapId)).toHaveLength(0);
        expect(await t.db.select().from(mapGroups).where(eq(mapGroups.mapId, dayMapId))).toHaveLength(0);
    });

    it("맵 이름은 유일하다", async () => {
        await expect(t.db.insert(maps).values({ name: "일봉", scope: "day" })).rejects.toThrow();
    });
});
