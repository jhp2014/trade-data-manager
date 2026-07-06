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

    it("빈 배열 저장은 no-op", async () => {
        await expect(raw.saveRawDailyCandles([])).resolves.toBeUndefined();
    });
});
