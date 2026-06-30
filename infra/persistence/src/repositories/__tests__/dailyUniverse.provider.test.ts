import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { MinuteCandle } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleMinuteCandleRepository } from "../minuteCandle.repository.js";
import { DrizzleDailyUniverseProvider } from "../dailyUniverse.provider.js";

const bar = (close: string) => ({ open: close, high: close, low: close, close, volume: "10" });
const mc = (code: string, date: string, time: string): MinuteCandle => ({
    stockCode: code,
    date,
    time,
    krx: bar("100"),
    un: bar("100"),
});

describe("DrizzleDailyUniverseProvider (pglite)", () => {
    let t: TestDb;
    let minute: DrizzleMinuteCandleRepository;
    let universe: DrizzleDailyUniverseProvider;

    beforeAll(async () => {
        t = await createTestDb();
        minute = new DrizzleMinuteCandleRepository(t.db);
        universe = new DrizzleDailyUniverseProvider(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("그날 분봉 있는 종목 distinct — 한 종목 여러 분봉이어도 1번", async () => {
        await minute.saveMinuteCandles([
            mc("005930", "2026-06-29", "09:00:00"),
            mc("005930", "2026-06-29", "09:01:00"), // 같은 종목 두 번째 봉
            mc("000660", "2026-06-29", "09:00:00"),
            mc("111111", "2026-06-30", "09:00:00"), // 다른 날 — 격리돼야
        ]);
        const codes = await universe.stockCodesByDate("2026-06-29");
        expect(codes.sort()).toEqual(["000660", "005930"]);
    });

    it("분봉 없는 날 → 빈 배열", async () => {
        expect(await universe.stockCodesByDate("2020-01-01")).toEqual([]);
    });
});
