import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleChartAnchorRepository } from "../chartAnchor.repository.js";

// 앵커는 언제나 차트(종목, 날짜) 소유다 — 옛 타점 소유(trade_time)는 2026-09-01 폐지.
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

    it("add — 저장본을 돌려주고, 같은 (차트,param,좌표,field,market) 재추가는 멱등(행이 안 는다)", async () => {
        const [line] = await repo.add([{ ...CHART, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "un" }]);
        expect(line.anchorDate).toBe("2026-06-27");
        // **계약에 id 가 없다** — 좌표가 정체성이다. id 는 저장소 안에만 산다: 로컬 미러와 Supabase 가
        // 각자 발급하고 전체교체 때 갈리므로, 밖으로 나가면 동기화를 건넌 참조가 다른 행을 가리킨다.
        expect(line).not.toHaveProperty("id");

        const [again] = await repo.add([{ ...CHART, param: "baseline", anchorDate: "2026-06-27", field: "high", market: "un" }]);
        expect(again).toEqual(line); // 새 행이 아니라 기존 행
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
    });

    it("listByChart — 그 차트만, id(그린 순서) 오름차순", async () => {
        await repo.add([{ ...OTHER_CHART, param: "baseline", anchorDate: "2026-06-30", field: "high", market: "un" }]);
        const mine = await repo.listByChart(CHART.stockCode, CHART.date);
        expect(mine.every((a) => a.date === CHART.date)).toBe(true);
    });

    it("listAll — 전 차트·전 param 전량(클라 복제본 로드)", async () => {
        const out = await repo.listAll();
        expect(out).toHaveLength(5); // CHART: baseline 3 + ignore-candle 1, OTHER_CHART: baseline 1
        expect(out.some((a) => a.param === "ignore-candle")).toBe(true);
        expect(out.some((a) => a.date === OTHER_CHART.date)).toBe(true);
    });

    it("remove — 그 좌표 행 하나만, 없는 좌표는 조용한 no-op", async () => {
        const lines = (await repo.listByChart(CHART.stockCode, CHART.date)).filter((a) => a.param === "baseline");
        await repo.remove(lines[0]);
        await repo.remove({ ...lines[0], anchorDate: "1999-01-01" }); // 없는 좌표 = no-op
        expect((await repo.listByChart(CHART.stockCode, CHART.date)).filter((a) => a.param === "baseline")).toHaveLength(lines.length - 1);
    });

    it("remove — 키는 **좌표 전체**다(한 필드만 달라도 안 지운다)", async () => {
        // 자연키 삭제의 핵심 성질: 같은 캔들이라도 field 가 다르면 다른 앵커다(가격선 성질).
        // 여기가 느슨하면 고점 선을 지우려다 저점 선까지 날아간다.
        const [saved] = await repo.add([{ ...CHART, param: "param-b", anchorDate: CHART.date, field: "high", market: "un" }]);
        await repo.remove({ ...saved, field: "low" }); // field 만 다름 → 안 지워져야
        expect((await repo.listByChart(CHART.stockCode, CHART.date)).some((a) => a.param === "param-b")).toBe(true);
        await repo.remove(saved);
        expect((await repo.listByChart(CHART.stockCode, CHART.date)).some((a) => a.param === "param-b")).toBe(false);
    });

    it("removeByParam — 그 차트의 그 param 전부(다른 차트·다른 param 은 보존)", async () => {
        await repo.removeByParam(CHART.stockCode, CHART.date, "baseline");
        const mine = await repo.listByChart(CHART.stockCode, CHART.date);
        expect(mine.map((a) => a.param)).toEqual(["ignore-candle"]);
        expect(await repo.listByChart(OTHER_CHART.stockCode, OTHER_CHART.date)).toHaveLength(1);
    });
});
