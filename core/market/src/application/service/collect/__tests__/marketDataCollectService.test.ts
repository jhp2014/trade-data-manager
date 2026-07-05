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
    MinuteCandleRepository,
    StockMasterProvider,
    StockMasterRepository,
} from "#port/outbound";

// 최소 fake outbound 들 — composer 가 협력자(real collector·sweep)를 조합하는지 검증.
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
    async updateIpoPrice(): Promise<void> {}
    async getByStockCodes(): Promise<StockMaster[]> {
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

function makeCollector(opts: {
    codes: string[];
    byDate: Record<string, DailyCandle[]>;
    latest: string | null;
    today?: string;
}) {
    const scanRepo = new FakeScanRepo(opts.byDate, opts.latest);
    const minuteRepo = new FakeMinuteRepo();
    const universe = new StockMasterIngestService({ provider: new FakeStockMasterProvider(opts.codes), repository: new NoopStockMasterRepo() });
    const dailyIngest = new DailyIngestService({
        dailyProvider: new FakeDailyProvider(),
        dailyRepo: { saveDailyCandles: async () => {}, getDailyCandles: async () => [], getDailyCandle: async () => null, getEarliestDailyDate: async () => null },
        today: () => "2026-06-28",
    });
    const rawDailyIngest = new RawDailyIngestService({
        rawProvider: { getRawDailyCandles: async () => [] },
        rawRepo: {
            saveRawDailyCandles: async () => {},
            getRawDailyCandles: async () => [],
            getEarliestRawDailyDate: async () => null,
            getPreviousRawClose: async () => null,
        },
    });
    const dailySweep = new DailySweepService({ dailyIngest, rawDailyIngest });
    const minuteSweep = new MinuteSweepService({ scanRepo, minuteProvider: new FakeMinuteProvider(), minuteRepo });
    const dailyCollector = new DailyCollector({ universe, dailySweep, scanRepo });
    const minuteCollector = new MinuteCollector({ scanRepo, minuteSweep, minuteRepo });
    // 시총은 이 composer 테스트의 관심 밖 — 고정 stored 로 폴딩 배선만 검증(collect=record / backfill=backfill).
    const marketCapRecorder = { record: async (date: string) => ({ date, universe: 1, stored: 7 }) };
    const marketCapBackfiller = {
        backfill: async (range: DateRange) => ({ range, universe: 1, stored: 3, failed: [] as string[] }),
    };
    const collector = new MarketDataCollectService({
        dailyCollector,
        minuteCollector,
        marketCapRecorder,
        marketCapBackfiller,
        today: () => opts.today ?? "2026-06-26",
    });
    return { collector, minuteRepo };
}

describe("collectToday (오늘)", () => {
    it("일봉 커버리지 충분(latest ≥ 오늘) → 일봉 생략, 오늘 분봉 스윕", async () => {
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
            today: "2026-06-26",
        });
        const r = await collector.collectToday();
        expect(r.dailyRefreshed).toBe(false);
        expect(r.universeCount).toBe(1);
        expect(r.range).toEqual({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.marketCapStored).toBe(7); // 당일 시총(record) 폴딩
    });

    it("커버리지 부족(latest < 오늘) → 일봉 재수집(dailyRefreshed=true)", async () => {
        const { collector } = makeCollector({ codes: ["A", "B"], byDate: {}, latest: "2026-06-20", today: "2026-06-26" });
        const r = await collector.collectToday();
        expect(r.dailyRefreshed).toBe(true);
    });

    it("overwrite=false: 이미 분봉 있는 날은 건너뜀(skippedDays)", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
            today: "2026-06-26",
        });
        minuteRepo.existing.add("2026-06-26");
        const r = await collector.collectToday();
        expect(r.skippedDays).toBe(1);
        expect(minuteRepo.saves).toBe(0);
    });

    it("overwrite=true: 건너뛰지 않고 스윕 시도 + 일봉 강제 재수집", async () => {
        const { collector, minuteRepo } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-26": [daily("A", "2026-06-26", dbar("100"))] },
            latest: "2026-06-26",
            today: "2026-06-26",
        });
        minuteRepo.existing.add("2026-06-26");
        const r = await collector.collectToday({ overwrite: true });
        expect(r.skippedDays).toBe(0);
        expect(r.dailyRefreshed).toBe(true); // overwrite 는 일봉도 강제
        expect(minuteRepo.deletes).toContain("2026-06-26"); // 비우고 새로(orphan 제거)
    });
});

describe("backfill (과거 구간)", () => {
    it("이미 최신이어도 일봉 항상 시딩(dailyRefreshed=true) + 구간 거래일 분봉", async () => {
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: {
                "2026-06-24": [daily("A", "2026-06-24", dbar("100"))],
                "2026-06-25": [daily("A", "2026-06-25", dbar("100"))],
            },
            latest: "2026-06-30", // 최신이 range.to 보다 뒤여도 backfill 은 게이트 없이 시딩
        });
        const r = await collector.backfill({ from: "2026-06-24", to: "2026-06-25" });
        expect(r.dailyRefreshed).toBe(true);
        expect(r.tradingDays).toBe(2);
        expect(r.range).toEqual({ from: "2026-06-24", to: "2026-06-25" });
        expect(r.marketCapStored).toBe(3); // 시총 백필(backfill) 폴딩
    });

    it("일봉 없는 날은 목록에서 자연 제외(구간 밖·미수집)", async () => {
        const { collector } = makeCollector({
            codes: ["A"],
            byDate: { "2026-06-25": [daily("A", "2026-06-25", dbar("100"))] }, // 구간 [24,26] 중 25만 존재
            latest: "2026-06-30",
        });
        const r = await collector.backfill({ from: "2026-06-24", to: "2026-06-26" });
        expect(r.tradingDays).toBe(1);
    });
});
