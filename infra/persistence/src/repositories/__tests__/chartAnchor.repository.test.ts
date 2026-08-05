import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleChartAnchorRepository } from "../chartAnchor.repository.js";

// 차트 소유 — 타점(review_points)이 없어도 앵커를 매달 수 있다(FK 없음: 선은 타점보다 오래 산다).
const CHART = { stockCode: "005930", date: "2026-06-30" };
const OTHER_CHART = { stockCode: "005930", date: "2026-07-01" };

describe("DrizzleChartAnchorRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleChartAnchorRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleChartAnchorRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("add — id 를 채워 돌려주고, 같은 (차트,param,좌표,field,market) 재추가는 멱등(기존 행 반환)", async () => {
        const [line] = await repo.add([{ ...CHART, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "un" }]);
        expect(line.id).toBeTruthy();

        const [again] = await repo.add([{ ...CHART, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "un" }]);
        expect(again.id).toBe(line.id); // 새 행이 아니라 기존 행
        expect(await repo.listByChart(CHART.stockCode, CHART.date)).toHaveLength(1);
    });

    it("같은 캔들이라도 field/market 이 다르면 별개 행 — 뜻이 다른 선의 공존(가격선 성질)", async () => {
        await repo.add([
            { ...CHART, param: "baseline", anchorDate: "2026-06-27", field: "low", market: "un" },
            { ...CHART, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "krx" },
        ]);
        expect(await repo.listByChart(CHART.stockCode, CHART.date)).toHaveLength(3);
    });

    it("일봉 앵커(anchor_time NULL) 멱등 — NULL 컬럼을 isNull 로 대야 중복이 안 쌓인다", async () => {
        await repo.add([{ ...CHART, param: "ignore-candle", anchorDate: "2026-06-24" }]);
        await repo.add([{ ...CHART, param: "ignore-candle", anchorDate: "2026-06-24" }]);
        const ignored = (await repo.listByChart(CHART.stockCode, CHART.date)).filter((a) => a.param === "ignore-candle");
        expect(ignored).toHaveLength(1);
        expect(ignored[0].field).toBeUndefined(); // 시각 앵커 — NULL → undefined 왕복
        expect(ignored[0].time).toBeUndefined(); // 차트 소유 — trade_time NULL
    });

    it("listByChart — 그 차트만, id(그린 순서) 오름차순", async () => {
        await repo.add([{ ...OTHER_CHART, param: "baseline", anchorDate: "2026-06-30", field: "high", market: "un" }]);
        const mine = await repo.listByChart(CHART.stockCode, CHART.date);
        expect(mine.every((a) => a.date === CHART.date)).toBe(true);
        expect(mine.map((a) => BigInt(a.id))).toEqual([...mine.map((a) => BigInt(a.id))].sort((x, y) => (x < y ? -1 : 1)));
    });

    it("listAnchoredCharts — 기준선만 센다(무시 캔들만 있는 차트는 작업셋이 아니다), 날짜 내림차순", async () => {
        const out = await repo.listAnchoredCharts();
        expect(out).toEqual([
            { stockCode: CHART.stockCode, date: OTHER_CHART.date, count: 1 },
            { stockCode: CHART.stockCode, date: CHART.date, count: 3 },
        ]);
    });

    it("removeById — 그 행 하나만, 없는 id 는 조용한 no-op", async () => {
        const lines = (await repo.listByChart(CHART.stockCode, CHART.date)).filter((a) => a.param === "baseline");
        await repo.removeById(lines[0].id);
        await repo.removeById("999999"); // no-op
        expect((await repo.listByChart(CHART.stockCode, CHART.date)).filter((a) => a.param === "baseline")).toHaveLength(lines.length - 1);
    });

    it("removeByPoint — 그 타점 소유 행만(차트 소유 행은 NULL 이라 안 걸린다)", async () => {
        await repo.add([
            { ...CHART, time: "09:30:00", param: "skeleton-minute", anchorDate: CHART.date, anchorTime: "09:10:00", field: "high", market: "un" },
            { ...CHART, time: "10:00:00", param: "skeleton-minute", anchorDate: CHART.date, anchorTime: "09:50:00", field: "high", market: "un" },
        ]);
        const before = (await repo.listByChart(CHART.stockCode, CHART.date)).length;
        await repo.removeByPoint(CHART.stockCode, CHART.date, "09:30:00");
        const left = await repo.listByChart(CHART.stockCode, CHART.date);
        expect(left).toHaveLength(before - 1);
        expect(left.filter((a) => a.time === "09:30:00")).toHaveLength(0);
        expect(left.filter((a) => a.time === "10:00:00")).toHaveLength(1); // 다른 타점 보존
        expect(left.filter((a) => a.time === undefined).length).toBeGreaterThan(0); // 차트 소유 보존
        await repo.removeByPoint(CHART.stockCode, CHART.date, "10:00:00");
    });

    it("removeByParam — 그 차트의 그 param 전부(다른 차트·다른 param 은 보존)", async () => {
        await repo.removeByParam(CHART.stockCode, CHART.date, "baseline");
        const mine = await repo.listByChart(CHART.stockCode, CHART.date);
        expect(mine.map((a) => a.param)).toEqual(["ignore-candle"]);
        expect(await repo.listByChart(OTHER_CHART.stockCode, OTHER_CHART.date)).toHaveLength(1);
    });
});
