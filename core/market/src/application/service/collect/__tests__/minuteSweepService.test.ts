import { describe, it, expect } from "vitest";
import { MinuteSweepService } from "../minuteSweepService.js";
import type { DailyBar, DailyCandle, MinuteCandle } from "#domain";
import type {
    DailyScanRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "#port/outbound";

const dbar = (close: string, high = close, amount = "1"): DailyBar => ({ open: close, high, low: close, close, volume: "1", amount });
const daily = (stockCode: string, date: string, un: DailyBar): DailyCandle => ({ stockCode, date, krx: un, un });
const mcandle = (stockCode: string, price: string, vol: string): MinuteCandle => ({
    stockCode,
    date: "2026-06-26",
    time: "09:00:00",
    krx: null,
    un: { open: price, high: price, low: price, close: price, volume: vol },
});

class FakeScanRepo implements DailyScanRepository {
    constructor(private byDate: Record<string, DailyCandle[]>) {}
    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        return this.byDate[date] ?? [];
    }
    async getPreviousTradingDate(date: string): Promise<string | null> {
        const e = Object.keys(this.byDate).filter((d) => d < date).sort();
        return e.length ? e[e.length - 1] : null;
    }
    async getLatestDailyDate(): Promise<string | null> {
        const d = Object.keys(this.byDate).sort();
        return d.length ? d[d.length - 1] : null;
    }
    async listTradedStockCodes(): Promise<string[]> {
        return [];
    }
    async listTradedDates(): Promise<string[]> {
        return Object.keys(this.byDate).sort();
    }
}
class FakeMinuteProvider implements MinuteCandleProvider {
    constructor(private byStock: Record<string, MinuteCandle[]>) {}
    async getMinuteCandles(stockCode: string): Promise<MinuteCandle[]> {
        return this.byStock[stockCode] ?? [];
    }
}
class FakeMinuteRepo implements MinuteCandleRepository {
    savedStocks: string[] = [];
    async saveMinuteCandles(candles: MinuteCandle[]): Promise<void> {
        if (candles.length) this.savedStocks.push(candles[0].stockCode);
    }
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return [];
    }
    async hasMinuteCandlesOnDate(): Promise<boolean> {
        return false;
    }
    async deleteMinuteCandlesOnDate(): Promise<number> {
        return 0;
    }
}

describe("sweepMinutesForDate", () => {
    it("저장 = pool(≥200억∪10%) 전체 — 받은 종목 그대로, 빈 분봉만 제외", async () => {
        const scan = new FakeScanRepo({
            // 셋 다 거래대금 ≥200억(floor 통과) → pool = 전부.
            "2026-06-26": [
                daily("A", "2026-06-26", dbar("100", "100", "30000000000")),
                daily("B", "2026-06-26", dbar("100", "100", "30000000000")),
                daily("C", "2026-06-26", dbar("100", "100", "30000000000")),
            ],
        });
        const provider = new FakeMinuteProvider({ A: [mcandle("A", "100", "10")], B: [mcandle("B", "100", "10")], C: [] });
        const repo = new FakeMinuteRepo();
        const r = await new MinuteSweepService({ scanRepo: scan, minuteProvider: provider, minuteRepo: repo }).sweepMinutesForDate("2026-06-26");
        expect(r.poolSize).toBe(3); // 셋 다 ≥200억 → 전부 pool
        expect(r.fetched).toBe(3);
        expect(r.stored).toBe(2); // C 는 빈 분봉 → 미저장
        expect(repo.savedStocks.sort()).toEqual(["A", "B"]);
    });

    it("데이터 없는 날 no-op", async () => {
        const r = await new MinuteSweepService({
            scanRepo: new FakeScanRepo({}),
            minuteProvider: new FakeMinuteProvider({}),
            minuteRepo: new FakeMinuteRepo(),
        }).sweepMinutesForDate("2026-06-26");
        expect(r).toEqual({ date: "2026-06-26", poolSize: 0, fetched: 0, stored: 0, failed: [] });
    });

    it("poolLimit 으로 대상 수 제한", async () => {
        const scan = new FakeScanRepo({
            // 셋 다 ≥200억 → pool=전부(입력순 A,B,C), poolLimit=2 가 앞 2개로 자름.
            "2026-06-26": [
                daily("A", "2026-06-26", dbar("100", "100", "30000000000")),
                daily("B", "2026-06-26", dbar("100", "100", "25000000000")),
                daily("C", "2026-06-26", dbar("100", "100", "20000000000")),
            ],
        });
        const provider = new FakeMinuteProvider({ A: [mcandle("A", "100", "10")], B: [mcandle("B", "100", "10")], C: [mcandle("C", "100", "10")] });
        const r = await new MinuteSweepService({ scanRepo: scan, minuteProvider: provider, minuteRepo: new FakeMinuteRepo() }).sweepMinutesForDate("2026-06-26", { poolLimit: 2 });
        expect(r.poolSize).toBe(2);
        expect(r.stored).toBe(2);
    });
});
