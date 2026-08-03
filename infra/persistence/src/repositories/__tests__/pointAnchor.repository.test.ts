import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzlePointAnchorRepository } from "../pointAnchor.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
// 다중성은 param 정의(AnchorParamDef.multiple)가 결정하고 저장소는 이 플래그만 받는다 — 여기선 둘 다 직접 검증.
const REPLACE = { replace: true };
const APPEND = { replace: false };

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

    it("put(replace) — 같은 (타점,param) 재지정은 좌표가 달라도 교체(가격 앵커 → 시각 앵커 전환 포함)", async () => {
        await repo.put({ ...P1, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "un" }, REPLACE);
        await repo.put({ ...P1, param: "baseline", anchorDate: "2026-06-30", anchorTime: "09:05:00", field: "low", market: "krx" }, REPLACE);

        const all = await repo.listByChart(P1.stockCode, P1.date);
        const mine = all.filter((x) => x.time === P1.time && x.param === "baseline");
        expect(mine).toEqual([{ ...P1, param: "baseline", anchorDate: "2026-06-30", anchorTime: "09:05:00", field: "low", market: "krx" }]);
    });

    it("put(append) — 다중 param 은 좌표마다 쌓이고, 같은 좌표 재지정은 멱등 no-op", async () => {
        await repo.put({ ...P1, param: "ignore-candle", anchorDate: "2026-06-24" }, APPEND);
        await repo.put({ ...P1, param: "ignore-candle", anchorDate: "2026-06-25" }, APPEND);
        await repo.put({ ...P1, param: "ignore-candle", anchorDate: "2026-06-24" }, APPEND); // 같은 캔들 재지정

        const ignored = (await repo.listByChart(P1.stockCode, P1.date)).filter((a) => a.param === "ignore-candle");
        expect(ignored.map((a) => a.anchorDate)).toEqual(["2026-06-24", "2026-06-25"]);
    });

    it("일봉 앵커(anchor_time NULL)도 중복이 안 쌓인다 — NULLS NOT DISTINCT 유니크", async () => {
        const before = (await repo.listAll()).length;
        await repo.put({ ...P1, param: "ignore-candle", anchorDate: "2026-06-25" }, APPEND);
        expect((await repo.listAll()).length).toBe(before);
    });

    it("한 타점에 param 이 다르면 공존, 타점이 다르면 서로 안 겹친다", async () => {
        await repo.put({ ...P1, param: "surge-start", anchorDate: "2026-06-30", anchorTime: "09:03:00" }, REPLACE); // 시각 앵커(field/market 없음)
        await repo.put({ ...P2, param: "baseline", anchorDate: "2026-06-27", field: "close", market: "un" }, REPLACE);

        const all = await repo.listByChart(P1.stockCode, P1.date);
        expect(all.filter((a) => a.time === P1.time)).toHaveLength(4); // baseline + ignore-candle 2 + surge-start
        const surge = all.find((x) => x.param === "surge-start");
        expect(surge?.field).toBeUndefined(); // 시각 앵커 — NULL → undefined 왕복
        expect(surge?.market).toBeUndefined();
    });

    it("remove(coord) — 좌표를 주면 그 캔들 하나만 지운다(일봉 앵커 = anchor_time NULL 매칭)", async () => {
        await repo.remove(P1, "ignore-candle", { anchorDate: "2026-06-24" });
        const left = (await repo.listByChart(P1.stockCode, P1.date)).filter((a) => a.param === "ignore-candle");
        expect(left.map((a) => a.anchorDate)).toEqual(["2026-06-25"]);
    });

    it("remove — 좌표 없이 부르면 그 param 전부, 없는 앵커는 조용한 no-op", async () => {
        await repo.remove(P1, "surge-start");
        await repo.remove(P1, "surge-start"); // 재삭제 no-op
        await repo.remove(P1, "ignore-candle");
        expect((await repo.listByChart(P1.stockCode, P1.date)).map((a) => a.param).sort()).toEqual(["baseline", "baseline"]);
    });

    it("타점 삭제 → 앵커 cascade", async () => {
        await points.remove(P2.stockCode, P2.date, P2.time);
        const all = await repo.listAll();
        expect(all.some((a) => a.time === P2.time)).toBe(false);
        expect(all.some((a) => a.time === P1.time)).toBe(true);
    });
});
