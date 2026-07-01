import { describe, it, expect } from "vitest";
import { DailySweepService } from "../dailySweepService.js";
import { MarketDataIngestService } from "../marketDataIngestService.js";
import type { DailyCandle, DateRange, MinuteCandle } from "#domain";
import type {
    DailyCandleProvider,
    DailyCandleRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "#port/outbound";

const bar = (close: string) => ({ open: close, high: close, low: close, close, volume: "1", amount: "1" });
const candle = (stockCode: string, date: string): DailyCandle => ({ stockCode, date, krx: bar("100"), un: bar("100") });

// 종목별로 다른 행동(정상/실패/빈배열)을 내는 fake 일봉 provider.
class FakeDailyProvider implements DailyCandleProvider {
    constructor(private behavior: Record<string, "ok" | "throw" | "empty">) {}
    async getDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]> {
        const b = this.behavior[stockCode] ?? "ok";
        if (b === "throw") throw new Error(`boom ${stockCode}`);
        if (b === "empty") return [];
        return [candle(stockCode, range.to)];
    }
}
class NoopMinuteProvider implements MinuteCandleProvider {
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return [];
    }
}
class CountingDailyRepo implements DailyCandleRepository {
    saved: string[] = [];
    async saveDailyCandles(candles: DailyCandle[]): Promise<void> {
        if (candles.length) this.saved.push(candles[0].stockCode);
    }
    async getDailyCandles(): Promise<DailyCandle[]> {
        return [];
    }
    async getDailyCandle(): Promise<DailyCandle | null> {
        return null; // 자가치유 경계비교 미발동(=healed 없음)
    }
    async getEarliestDailyDate(): Promise<string | null> {
        return null;
    }
}
class NoopMinuteRepo implements MinuteCandleRepository {
    async saveMinuteCandles(): Promise<void> {}
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

function makeSweep(behavior: Record<string, "ok" | "throw" | "empty">) {
    const dailyRepo = new CountingDailyRepo();
    const dailyIngest = new MarketDataIngestService({
        dailyProvider: new FakeDailyProvider(behavior),
        minuteProvider: new NoopMinuteProvider(),
        dailyRepo,
        minuteRepo: new NoopMinuteRepo(),
        today: () => "2026-06-28",
    });
    return { sweep: new DailySweepService({ dailyIngest }), dailyRepo };
}

describe("sweepDailyForUniverse", () => {
    it("전종목 펼쳐 ingest — 성공 카운트 + 진행률", async () => {
        const { sweep, dailyRepo } = makeSweep({ A: "ok", B: "ok", C: "ok" });
        const progress: number[] = [];
        const r = await sweep.sweepDailyForUniverse(["A", "B", "C"], {
            onFetch: (done, total) => progress.push(done) && total,
        });
        expect(r.universeSize).toBe(3);
        expect(r.fetched).toBe(3);
        expect(r.failed).toEqual([]);
        expect(dailyRepo.saved.sort()).toEqual(["A", "B", "C"]);
        expect(progress).toEqual([1, 2, 3]); // 진행률은 1..total
    });

    it("종목 실패 격리 — 한 종목이 던져도 나머지는 계속, failed 에 수집", async () => {
        const { sweep, dailyRepo } = makeSweep({ A: "ok", B: "throw", C: "ok" });
        const r = await sweep.sweepDailyForUniverse(["A", "B", "C"]);
        expect(r.fetched).toBe(2); // A, C
        expect(r.failed).toHaveLength(1);
        expect(r.failed[0].stockCode).toBe("B");
        expect(dailyRepo.saved.sort()).toEqual(["A", "C"]);
    });

    it("빈 일봉 종목은 fetched 로 세되 저장은 안 함", async () => {
        const { sweep, dailyRepo } = makeSweep({ A: "ok", B: "empty" });
        const r = await sweep.sweepDailyForUniverse(["A", "B"]);
        expect(r.fetched).toBe(2);
        expect(r.healed).toBe(0);
        expect(dailyRepo.saved).toEqual(["A"]);
    });
});
