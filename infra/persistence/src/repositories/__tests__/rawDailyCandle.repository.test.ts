import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DailyCandle } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleRawDailyCandleRepository } from "../rawDailyCandle.repository.js";

const bar = (close: string) => ({
    open: close,
    high: close,
    low: close,
    close,
    volume: "100",
    amount: "5000000",
});

describe("DrizzleRawDailyCandleRepository (pglite)", () => {
    let t: TestDb;
    let raw: DrizzleRawDailyCandleRepository;

    beforeAll(async () => {
        t = await createTestDb();
        raw = new DrizzleRawDailyCandleRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("save→get 라운드트립 + 범위/오름차순", async () => {
        const c: DailyCandle = {
            stockCode: "005930",
            date: "2026-07-02",
            krx: bar("339500"),
            un: bar("339000"),
        };
        await raw.saveRawDailyCandles([
            c,
            { stockCode: "005930", date: "2026-07-01", krx: bar("330000"), un: bar("329000") },
        ]);
        const got = await raw.getRawDailyCandles("005930", { from: "2026-07-01", to: "2026-07-02" });
        expect(got.map((x) => x.date)).toEqual(["2026-07-01", "2026-07-02"]); // 오름차순
        expect(got[1]).toEqual(c);
    });

    it("append-only — 같은 (종목,날) 재저장은 기존 유지(onConflictDoNothing, 원주가 불변)", async () => {
        await raw.saveRawDailyCandles([
            { stockCode: "000660", date: "2026-07-02", krx: bar("100"), un: bar("100") },
        ]);
        // 같은 자연키로 다른 값 재저장 시도 → 무시되어야 함(덮어쓰기 아님).
        await raw.saveRawDailyCandles([
            { stockCode: "000660", date: "2026-07-02", krx: bar("999"), un: bar("999") },
        ]);
        const got = await raw.getRawDailyCandles("000660", { from: "2026-07-01", to: "2026-07-03" });
        expect(got).toHaveLength(1);
        expect(got[0].krx.close).toBe("100"); // 최초값 유지
    });

    it("getEarliestRawDailyDate = 가장 과거 저장일(없으면 null)", async () => {
        expect(await raw.getEarliestRawDailyDate("777777")).toBeNull();
        await raw.saveRawDailyCandles([
            { stockCode: "777777", date: "2026-07-02", krx: bar("1"), un: bar("1") },
            { stockCode: "777777", date: "2025-07-15", krx: bar("1"), un: bar("1") },
            { stockCode: "777777", date: "2026-01-05", krx: bar("1"), un: bar("1") },
        ]);
        expect(await raw.getEarliestRawDailyDate("777777")).toBe("2025-07-15");
    });

    it("getPreviousRawClose = date 직전 거래일 원주가 종가(시장별), 없으면 null", async () => {
        await raw.saveRawDailyCandles([
            { stockCode: "111111", date: "2026-07-01", krx: bar("100"), un: bar("101") },
            { stockCode: "111111", date: "2026-07-02", krx: bar("200"), un: bar("202") },
        ]);
        // 2026-07-03 직전 = 07-02
        expect(await raw.getPreviousRawClose("111111", "2026-07-03")).toEqual({ krxClose: "200", unClose: "202" });
        // 2026-07-02 직전 = 07-01 (당일 제외, date 미만)
        expect(await raw.getPreviousRawClose("111111", "2026-07-02")).toEqual({ krxClose: "100", unClose: "101" });
        // 그 이전이 없으면 null(상장 첫날)
        expect(await raw.getPreviousRawClose("111111", "2026-07-01")).toBeNull();
        expect(await raw.getPreviousRawClose("000000", "2026-07-03")).toBeNull();
    });

    it("빈 배열 저장은 no-op", async () => {
        await expect(raw.saveRawDailyCandles([])).resolves.toBeUndefined();
    });
});
