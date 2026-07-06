import { describe, it, expect } from "vitest";
import { MarketDataCollectService } from "../marketDataCollectService.js";
import { DailyCollector } from "../dailyCollector.js";
import { MinuteCollector } from "../minuteCollector.js";
import { StockMasterIngestService } from "../stockMasterIngestService.js";
import { DailyIngestService } from "../dailyIngestService.js";
import { RawDailyIngestService } from "../rawDailyIngestService.js";
import { DailySweepService } from "../dailySweepService.js";
import { MinuteSweepService } from "../minuteSweepService.js";
import type { DailyBar, DailyCandle, DateRange, MinuteCandle, StockMaster } from "#domain";
import type {
    DailyCandleProvider,
    DailyScanRepository,
    MinuteCandleProvider,
    MinuteCandleStore,
    StockMasterProvider,
    StockMasterStore,
} from "#port/collect";

// 최소 fake outbound 들 — composer 가 협력자(real collector·sweep)를 조합하는지 검증.
const dbar = (close: string, high = close, amount = "1"): DailyBar => ({ open: close, high, low: close, close, volume: "1", amount });
const daily = (stockCode: string, date: string, un: DailyBar): DailyCandle => ({ stockCode, date, krx: un, un });

class FakeStockMasterProvider implements StockMasterProvider {
    constructor(private codes: string[]) {}
    async listStockMasters(): Promise<StockMaster[]> {
        return this.codes.map((stockCode) => ({ stockCode, name: stockCode, market: "거래소", listingDate: null, ipoPrice: null }));
    }
}
class NoopStockMasterRepo implements StockMasterStore {
    async saveStockMasters(): Promise<void> {}
    async updateIpoPrice(): Promise<void> {}
    async getByStockCodes(): Promise<StockMaster[]> {
        return [];
    }
    async listNeedingIpoPrice(): Promise<{ stockCode: string; listingDate: string }[]> {
        return [];
    }
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
    async listTradedStockCodes(): Promise<string[]> {
        return [];
    }
    async listTradedDates(range: DateRange): Promise<string[]> {
        return Object.keys(this.byDate)
            .filter((d) => d >= range.from && d <= range.to)
            .sort();
    }
}
class FakeMinuteProvider implements MinuteCandleProvider {
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return [];
    }
}
class FakeMinuteRepo implements MinuteCandleStore {
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

function makeCollector(opts: {
    codes: string[];
    byDate: Record<string, DailyCandle[]>;
    latest: string | null;
}) {
    const scanRepo = new FakeScanRepo(opts.byDate, opts.latest);
    const minuteRepo = new FakeMinuteRepo();
    const universe = new StockMasterIngestService({ provider: new FakeStockMasterProvider(opts.codes), repository: new NoopStockMasterRepo() });
    const dailyIngest = new DailyIngestService({
        dailyProvider: new FakeDailyProvider(),
        dailyRepo: { saveDailyCandles: async () => {}, getDailyCandle: async () => null, getEarliestDailyDate: async () => null },
        today: () => "2026-06-28",
    });
    const rawDailyIngest = new RawDailyIngestService({
        rawProvider: { getRawDailyCandles: async () => [] },
        rawRepo: {
            saveRawDailyCandles: async () => {},
        },
    });
    const dailySweep = new DailySweepService({ dailyIngest, rawDailyIngest });
    const minuteSweep = new MinuteSweepService({ scanRepo, minuteProvider: new FakeMinuteProvider(), minuteRepo });
    const dailyCollector = new DailyCollector({ universe, dailySweep, scanRepo });
    const minuteCollector = new MinuteCollector({ scanRepo, minuteSweep, minuteRepo });
    const collector = new MarketDataCollectService({ dailyCollector, minuteCollector });
    return { collector, minuteRepo };
}

describe("backfill", () => {
    it("일봉 커버리지 충분(latest ≥ range.to) + overwrite 없음 → 일봉 생략, 분봉만 스윕", async () => {
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
        });
        const r = await collector.backfill({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.dailyRefreshed).toBe(false);
        expect(r.universeCount).toBe(1);
        expect(r.range).toEqual({ from: "2026-06-26", to: "2026-06-26" });
    });

    it("커버리지 부족(latest < range.to) → 일봉 재수집(dailyRefreshed=true)", async () => {
        const { collector } = makeCollector({ codes: ["A", "B"], byDate: {}, latest: "2026-06-20" });
        const r = await collector.backfill({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.dailyRefreshed).toBe(true);
    });

    it("과거 구간은 overwrite 없으면 게이트로 일봉 생략(latest ≥ range.to)", async () => {
        // latest(오늘)가 과거 range.to 보다 뒤 → skip-if-present 로 일봉 스윕 생략. 과거 시딩엔 overwrite 필요.
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-25": [daily("A", "2026-06-25", dbar("100"))] },
            latest: "2026-06-30",
        });
        const r = await collector.backfill({ from: "2026-06-24", to: "2026-06-26" });
        expect(r.dailyRefreshed).toBe(false);
        expect(r.tradingDays).toBe(1); // 일봉 있는 25만 분봉 수집
    });

    it("overwrite=true → 일봉 강제 재수집 + 분봉 delete·refetch", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-25": [daily("A", "2026-06-25", dbar("100"))] },
            latest: "2026-06-30",
        });
        minuteRepo.existing.add("2026-06-25");
        const r = await collector.backfill({ from: "2026-06-24", to: "2026-06-26" }, { overwrite: true });
        expect(r.dailyRefreshed).toBe(true); // 게이트 무시하고 강제
        expect(r.skippedDays).toBe(0);
        expect(minuteRepo.deletes).toContain("2026-06-25"); // 비우고 새로(orphan 제거)
    });

    it("overwrite=false: 이미 분봉 있는 날은 건너뜀(skippedDays)", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
        });
        minuteRepo.existing.add("2026-06-26");
        const r = await collector.backfill({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.skippedDays).toBe(1);
        expect(minuteRepo.saves).toBe(0);
    });

    it("일봉 없는 날은 목록에서 자연 제외", async () => {
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
        });
        const r = await collector.backfill({ from: "2026-06-24", to: "2026-06-26" });
        expect(r.tradingDays).toBe(1); // 26만 존재
    });
});

describe("backfillDaily", () => {
    it("일봉만 — 분봉 스윕 안 함, 결과에 분봉 필드 없음", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-20",
        });
        const r = await collector.backfillDaily({ from: "2026-06-26", to: "2026-06-26" });
        expect(r).toEqual({ range: { from: "2026-06-26", to: "2026-06-26" }, universeCount: 1, dailyRefreshed: true });
        expect(minuteRepo.saves).toBe(0);
        expect(minuteRepo.deletes).toEqual([]);
    });
});
