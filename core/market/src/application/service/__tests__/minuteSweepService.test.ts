import { describe, it, expect } from "vitest";
import { MinuteSweepService } from "../minuteSweepService.js";
import type { DailyBar, DailyCandle, MinuteCandle } from "../../../domain/index.js";
import type {
    DailyScanRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "../../port/outbound/index.js";

const dbar = (close: string, high: string, amount: string): DailyBar => ({
    open: close,
    high,
    low: close,
    close,
    volume: "1",
    amount,
});

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
        const earlier = Object.keys(this.byDate).filter((d) => d < date).sort();
        return earlier.length ? earlier[earlier.length - 1] : null;
    }
    async getLatestDailyDate(): Promise<string | null> {
        const dates = Object.keys(this.byDate).sort();
        return dates.length ? dates[dates.length - 1] : null;
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
}

describe("sweepMinutesForDate", () => {
    it("저장 = 분단위 누적 ever-탑100 ∪ ≥15% 게이너 (나머지는 fetch 후 폐기)", async () => {
        // 전일 모두 100. 당일: L=유동(거래대금 큼,+5%), G=게이너(+20%,분봉 소액), N=둘 다 아님(+3%,소액)
        const scan = new FakeScanRepo({
            "2026-06-25": [
                daily("L", "2026-06-25", dbar("100", "100", "0")),
                daily("G", "2026-06-25", dbar("100", "100", "0")),
                daily("N", "2026-06-25", dbar("100", "100", "0")),
            ],
            "2026-06-26": [
                daily("L", "2026-06-26", dbar("101", "105", "999999")), // +5%, 거래대금 큼
                daily("G", "2026-06-26", dbar("118", "120", "10")), // +20% 게이너
                daily("N", "2026-06-26", dbar("102", "103", "10")), // +3%, 소액
            ],
        });
        const provider = new FakeMinuteProvider({
            L: [mcandle("L", "100", "1000")], // 분봉거래대금 100,000 → 분단위 탑1
            G: [mcandle("G", "100", "1")], // 100
            N: [mcandle("N", "100", "2")], // 200
        });
        const repo = new FakeMinuteRepo();
        const service = new MinuteSweepService({ scanRepo: scan, minuteProvider: provider, minuteRepo: repo });

        const r = await service.sweepMinutesForDate("2026-06-26", { minuteTop: 1 });

        expect(r.poolSize).toBe(3); // 3종목뿐이라 거래대금 탑400 ∪ ≥15% = 전부 fetch
        expect(r.fetched).toBe(3);
        expect(r.stored).toBe(2); // L(분단위 탑1) + G(게이너). N 폐기.
        expect(repo.savedStocks.sort()).toEqual(["G", "L"]);
    });

    it("데이터 없는 날은 no-op", async () => {
        const service = new MinuteSweepService({
            scanRepo: new FakeScanRepo({}),
            minuteProvider: new FakeMinuteProvider({}),
            minuteRepo: new FakeMinuteRepo(),
        });
        expect(await service.sweepMinutesForDate("2026-06-26")).toEqual({
            date: "2026-06-26",
            poolSize: 0,
            fetched: 0,
            stored: 0,
            failed: [],
        });
    });

    it("poolLimit 으로 fetch 종목 수 제한(스모크)", async () => {
        const scan = new FakeScanRepo({
            "2026-06-26": [
                daily("A", "2026-06-26", dbar("100", "100", "300")),
                daily("B", "2026-06-26", dbar("100", "100", "200")),
                daily("C", "2026-06-26", dbar("100", "100", "100")),
            ],
        });
        const provider = new FakeMinuteProvider({
            A: [mcandle("A", "100", "10")],
            B: [mcandle("B", "100", "10")],
            C: [mcandle("C", "100", "10")],
        });
        const service = new MinuteSweepService({ scanRepo: scan, minuteProvider: provider, minuteRepo: new FakeMinuteRepo() });
        const r = await service.sweepMinutesForDate("2026-06-26", { poolLimit: 2 });
        expect(r.poolSize).toBe(2);
        expect(r.fetched).toBe(2);
    });
});
