import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DailyCandle, MinuteCandle } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleDailyCandleRepository } from "../dailyCandle.repository.js";
import { DrizzleMinuteCandleRepository } from "../minuteCandle.repository.js";

const dailyBar = (close: string) => ({
    open: close,
    high: close,
    low: close,
    close,
    volume: "100",
    amount: "5000000",
});

const minuteBar = (close: string) => ({ open: close, high: close, low: close, close, volume: "10" });

describe("Drizzle candle repositories (pglite)", () => {
    let t: TestDb;
    let daily: DrizzleDailyCandleRepository;
    let minute: DrizzleMinuteCandleRepository;

    beforeAll(async () => {
        t = await createTestDb();
        daily = new DrizzleDailyCandleRepository(t.db);
        minute = new DrizzleMinuteCandleRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("일봉 save→get 라운드트립 + 자연키 upsert(덮어쓰기)", async () => {
        const c: DailyCandle = {
            stockCode: "005930",
            date: "2026-06-26",
            krx: dailyBar("339500"),
            un: dailyBar("339000"),
        };
        await daily.saveDailyCandles([c]);
        expect(await daily.getDailyCandle("005930", "2026-06-26")).toEqual(c);

        // 같은 자연키 재저장 = 덮어쓰기(중복행 X)
        const c2: DailyCandle = { ...c, krx: dailyBar("340000"), un: dailyBar("339800") };
        await daily.saveDailyCandles([c2]);
        const range = await daily.getDailyCandles("005930", { from: "2026-06-01", to: "2026-06-30" });
        expect(range).toHaveLength(1);
        expect(range[0].krx.close).toBe("340000");
    });

    it("분봉 save→get + KRX nullable(프리마켓) 보존 + 시간 오름차순", async () => {
        const rows: MinuteCandle[] = [
            // 09:00 = KRX+UN 둘 다
            { stockCode: "005930", date: "2026-06-26", time: "09:00:00", krx: minuteBar("339500"), un: minuteBar("339000") },
            // 08:00 = NXT 단독 프리마켓(KRX null)
            { stockCode: "005930", date: "2026-06-26", time: "08:00:00", krx: null, un: minuteBar("338000") },
        ];
        await minute.saveMinuteCandles(rows);
        const got = await minute.getMinuteCandles("005930", "2026-06-26");
        expect(got.map((m) => m.time)).toEqual(["08:00:00", "09:00:00"]); // 오름차순
        expect(got[0].krx).toBeNull(); // 프리마켓 KRX 부재 보존
        expect(got[0].un.close).toBe("338000");
        expect(got[1].krx?.close).toBe("339500");
    });
});
