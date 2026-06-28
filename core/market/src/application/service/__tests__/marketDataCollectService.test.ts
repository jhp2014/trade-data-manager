import { describe, it, expect } from "vitest";
import { MarketDataCollectService } from "../marketDataCollectService.js";
import { StockMasterIngestService } from "../stockMasterIngestService.js";
import { MarketDataIngestService } from "../marketDataIngestService.js";
import { MinuteSweepService } from "../minuteSweepService.js";
import type { DailyBar, DailyCandle, MinuteCandle, StockMaster } from "../../../domain/index.js";
import type {
    DailyCandleProvider,
    DailyScanRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
    StockMasterProvider,
    StockMasterRepository,
} from "../../port/outbound/index.js";

// 최소 fake outbound 들 — collect 가 협력자(real 서비스)를 조합하는지 검증.
const dbar = (close: string, high = close, amount = "1"): DailyBar => ({ open: close, high, low: close, close, volume: "1", amount });
const daily = (stockCode: string, date: string, un: DailyBar): DailyCandle => ({ stockCode, date, krx: un, un });

class FakeStockMasterProvider implements StockMasterProvider {
    constructor(private codes: string[]) {}
    async listStockMasters(): Promise<StockMaster[]> {
        return this.codes.map((stockCode) => ({ stockCode, name: stockCode, market: "거래소", listingDate: null, ipoPrice: null }));
    }
}
class NoopStockMasterRepo implements StockMasterRepository {
    async saveStockMasters(): Promise<void> {}
}
class FakeDailyProvider implements DailyCandleProvider {
    async getDailyCandles(): Promise<DailyCandle[]> {
        return [];
    }
}
class FakeScanRepo implements DailyScanRepository {
    constructor(private byDate: Record<string, DailyCandle[]>, private latest: string | null) {}
    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        return this.byDate[date] ?? [];
    }
    async getPreviousTradingDate(date: string): Promise<string | null> {
        const e = Object.keys(this.byDate).filter((d) => d < date).sort();
        return e.length ? e[e.length - 1] : null;
    }
    async getLatestDailyDate(): Promise<string | null> {
        return this.latest;
    }
}
class FakeMinuteProvider implements MinuteCandleProvider {
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return [];
    }
}
class FakeMinuteRepo implements MinuteCandleRepository {
    existing = new Set<string>();
    saves = 0;
    deletes: string[] = [];
    async saveMinuteCandles(): Promise<void> {
        this.saves++;
    }
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return [];
    }
    async hasMinuteCandlesOnDate(date: string): Promise<boolean> {
        return this.existing.has(date);
    }
    async deleteMinuteCandlesOnDate(date: string): Promise<number> {
        this.deletes.push(date);
        return 0;
    }
}

function makeCollector(opts: { codes: string[]; byDate: Record<string, DailyCandle[]>; latest: string | null }) {
    const scanRepo = new FakeScanRepo(opts.byDate, opts.latest);
    const minuteRepo = new FakeMinuteRepo();
    const universe = new StockMasterIngestService({ provider: new FakeStockMasterProvider(opts.codes), repository: new NoopStockMasterRepo() });
    const dailyIngest = new MarketDataIngestService({
        dailyProvider: new FakeDailyProvider(),
        minuteProvider: new FakeMinuteProvider(),
        dailyRepo: { saveDailyCandles: async () => {}, getDailyCandles: async () => [], getDailyCandle: async () => null, getEarliestDailyDate: async () => null },
        minuteRepo,
        today: () => "2026-06-28",
    });
    const minuteSweep = new MinuteSweepService({ scanRepo, minuteProvider: new FakeMinuteProvider(), minuteRepo });
    const collector = new MarketDataCollectService({ universe, dailyIngest, minuteSweep, scanRepo, minuteRepo });
    return { collector, minuteRepo };
}

describe("collect", () => {
    it("일봉 커버리지 충분(latest ≥ to) → 일봉 생략, 날짜별 분봉 스윕", async () => {
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
        });
        const r = await collector.collect({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.dailyRefreshed).toBe(false);
        expect(r.universeCount).toBe(1);
    });

    it("커버리지 부족(latest < to) → 일봉 재수집(dailyRefreshed=true)", async () => {
        const { collector } = makeCollector({ codes: ["A", "B"], byDate: {}, latest: "2026-06-20" });
        const r = await collector.collect({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.dailyRefreshed).toBe(true);
    });

    it("overwrite=false: 이미 분봉 있는 날은 건너뜀(skippedDays)", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
        });
        minuteRepo.existing.add("2026-06-26");
        const r = await collector.collect({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.skippedDays).toBe(1);
        expect(minuteRepo.saves).toBe(0);
    });

    it("overwrite=true: 건너뛰지 않고 스윕 시도", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
        });
        minuteRepo.existing.add("2026-06-26");
        const r = await collector.collect({ from: "2026-06-26", to: "2026-06-26" }, { overwrite: true });
        expect(r.skippedDays).toBe(0);
        expect(r.dailyRefreshed).toBe(true); // overwrite 는 일봉도 강제
        expect(minuteRepo.deletes).toContain("2026-06-26"); // 비우고 새로(orphan 제거)
    });
});
