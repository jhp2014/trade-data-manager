import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzlePointAnchorRepository } from "../pointAnchor.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };

describe("DrizzlePointAnchorRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzlePointAnchorRepository;
    let points: DrizzleReviewPointRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzlePointAnchorRepository(t.db);
        points = new DrizzleReviewPointRepository(t.db);
        await points.upsert([P1, P2]); // point_anchors → review_points FK
    });
    afterAll(async () => {
        await t.close();
    });

    it("upsert — 같은 (타점,param) 재지정은 교체(가격 앵커 → 시각 앵커 전환 포함)", async () => {
        await repo.upsert({ ...P1, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "un" });
        await repo.upsert({ ...P1, param: "baseline", anchorDate: "2026-06-30", anchorTime: "09:05:00", field: "low", market: "krx" });

        const all = await repo.listByChart(P1.stockCode, P1.date);
        const a = all.find((x) => x.time === P1.time && x.param === "baseline");
        expect(a).toEqual({ ...P1, param: "baseline", anchorDate: "2026-06-30", anchorTime: "09:05:00", field: "low", market: "krx" });
    });

    it("한 타점에 param 이 다르면 공존, 타점이 다르면 서로 안 겹친다", async () => {
        await repo.upsert({ ...P1, param: "surge-start", anchorDate: "2026-06-30", anchorTime: "09:03:00" }); // 시각 앵커(field/market 없음)
        await repo.upsert({ ...P2, param: "baseline", anchorDate: "2026-06-27", field: "close", market: "un" });

        const all = await repo.listByChart(P1.stockCode, P1.date);
        expect(all).toHaveLength(3);
        const surge = all.find((x) => x.param === "surge-start");
        expect(surge?.field).toBeUndefined(); // 시각 앵커 — NULL → undefined 왕복
        expect(surge?.market).toBeUndefined();
    });

    it("remove — 자연키 지목 삭제, 없는 앵커는 조용한 no-op", async () => {
        await repo.remove(P1, "surge-start");
        await repo.remove(P1, "surge-start"); // 재삭제 no-op
        expect((await repo.listByChart(P1.stockCode, P1.date)).map((a) => a.param).sort()).toEqual(["baseline", "baseline"]);
    });

    it("타점 삭제 → 앵커 cascade", async () => {
        await points.remove(P2.stockCode, P2.date, P2.time);
        const all = await repo.listAll();
        expect(all.some((a) => a.time === P2.time)).toBe(false);
        expect(all.some((a) => a.time === P1.time)).toBe(true);
    });
});
