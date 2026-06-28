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

    it("getEarliestDailyDate = 가장 과거 저장일(없으면 null)", async () => {
        expect(await daily.getEarliestDailyDate("000660")).toBeNull();
        await daily.saveDailyCandles([
            { stockCode: "000660", date: "2026-06-26", krx: dailyBar("100"), un: dailyBar("100") },
            { stockCode: "000660", date: "2024-12-30", krx: dailyBar("90"), un: dailyBar("90") },
            { stockCode: "000660", date: "2025-03-15", krx: dailyBar("95"), un: dailyBar("95") },
        ]);
        expect(await daily.getEarliestDailyDate("000660")).toBe("2024-12-30");
    });

    it("스캔: listDailyCandlesByDate(전종목) + getPreviousTradingDate(직전 거래일)", async () => {
        // 격리용 미래 날짜. 같은 날 2종목, 직전 거래일 1개.
        const mk = (code: string, date: string): DailyCandle => ({
            stockCode: code,
            date,
            krx: dailyBar("100"),
            un: dailyBar("100"),
        });
        await daily.saveDailyCandles([
            mk("900001", "2031-03-03"),
            mk("900001", "2031-03-05"),
            mk("900002", "2031-03-05"),
        ]);

        const onDay = await daily.listDailyCandlesByDate("2031-03-05");
        expect(onDay.map((c) => c.stockCode).sort()).toEqual(["900001", "900002"]);

        // 2031-03-05 직전 데이터 있는 날 = 2031-03-03
        expect(await daily.getPreviousTradingDate("2031-03-05")).toBe("2031-03-03");
        // 그 이전이 없는 날 → null (전체 최古보다 과거)
        expect(await daily.getPreviousTradingDate("2000-01-01")).toBeNull();
        // 전체 최신 일봉일 = 방금 넣은 2031-03-05
        expect(await daily.getLatestDailyDate()).toBe("2031-03-05");
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
