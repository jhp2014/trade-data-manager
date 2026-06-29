import { describe, it, expect } from "vitest";
import { MarketDataIngestService } from "../marketDataIngestService.js";
import { defaultDailyRange } from "../../shared/dailyRange.js";
import type { DailyBar, DailyCandle, DateRange, MinuteCandle } from "../../../../domain/index.js";
import type {
    DailyCandleProvider,
    DailyCandleRepository,
    MinuteCandleProvider,
    MinuteCandleRepository,
} from "../../../port/outbound/index.js";

const bar = (close: string, volume = "100"): DailyBar => ({
    open: close,
    high: close,
    low: close,
    close,
    volume,
    amount: "0",
});

const candle = (date: string, close: string, volume = "100"): DailyCandle => ({
    stockCode: "005930",
    date,
    krx: bar(close, volume),
    un: bar(close, volume),
});

/** in-memory 일봉 리포 — (date,stock) 자연키 upsert. */
class FakeDailyRepo implements DailyCandleRepository {
    rows = new Map<string, DailyCandle>();
    saved: DailyCandle[][] = [];

    async saveDailyCandles(candles: DailyCandle[]): Promise<void> {
        this.saved.push(candles);
        for (const c of candles) this.rows.set(`${c.stockCode}|${c.date}`, c);
    }
    async getDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]> {
        return [...this.rows.values()]
            .filter((c) => c.stockCode === stockCode && c.date >= range.from && c.date <= range.to)
            .sort((a, b) => a.date.localeCompare(b.date));
    }
    async getDailyCandle(stockCode: string, date: string): Promise<DailyCandle | null> {
        return this.rows.get(`${stockCode}|${date}`) ?? null;
    }
    async getEarliestDailyDate(stockCode: string): Promise<string | null> {
        const dates = [...this.rows.values()]
            .filter((c) => c.stockCode === stockCode)
            .map((c) => c.date)
            .sort();
        return dates[0] ?? null;
    }
}

/** 호출 범위를 기록하고 미리 준 시리즈를 [from,to] 로 잘라 돌려주는 일봉 provider. */
class FakeDailyProvider implements DailyCandleProvider {
    calls: DateRange[] = [];
    constructor(private series: DailyCandle[]) {}
    async getDailyCandles(_stockCode: string, range: DateRange): Promise<DailyCandle[]> {
        this.calls.push(range);
        return this.series
            .filter((c) => c.date >= range.from && c.date <= range.to)
            .sort((a, b) => a.date.localeCompare(b.date));
    }
}

class FakeMinuteProvider implements MinuteCandleProvider {
    constructor(private series: MinuteCandle[]) {}
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return this.series;
    }
}

class FakeMinuteRepo implements MinuteCandleRepository {
    saved: MinuteCandle[] = [];
    async saveMinuteCandles(candles: MinuteCandle[]): Promise<void> {
        this.saved.push(...candles);
    }
    async getMinuteCandles(): Promise<MinuteCandle[]> {
        return this.saved;
    }
    async hasMinuteCandlesOnDate(): Promise<boolean> {
        return this.saved.length > 0;
    }
    async deleteMinuteCandlesOnDate(): Promise<number> {
        return 0;
    }
}

function makeService(opts: {
    daily: DailyCandle[];
    repo?: FakeDailyRepo;
    minute?: MinuteCandle[];
    today?: string;
}) {
    const dailyRepo = opts.repo ?? new FakeDailyRepo();
    const dailyProvider = new FakeDailyProvider(opts.daily);
    const minuteRepo = new FakeMinuteRepo();
    const minuteProvider = new FakeMinuteProvider(opts.minute ?? []);
    const service = new MarketDataIngestService({
        dailyProvider,
        minuteProvider,
        dailyRepo,
        minuteRepo,
        today: () => opts.today ?? "2026-06-28",
    });
    return { service, dailyRepo, dailyProvider, minuteRepo };
}

describe("defaultDailyRange", () => {
    it("오늘 기준 18개월 전 ~ 오늘", () => {
        expect(defaultDailyRange("2026-06-28")).toEqual({ from: "2024-12-28", to: "2026-06-28" });
    });
    it("말일은 대상 달 일수로 클램프", () => {
        // 2026-03-31 − 18개월 = 2024-09(30일) → 30 으로 클램프
        expect(defaultDailyRange("2026-03-31").from).toBe("2024-09-30");
    });
});

describe("ingestDailyCandles", () => {
    it("빈 수집은 저장 안 함", async () => {
        const { service, dailyRepo } = makeService({ daily: [] });
        const r = await service.ingestDailyCandles("005930", { from: "2026-06-01", to: "2026-06-28" });
        expect(r).toEqual({ stockCode: "005930", healed: false, saved: 0 });
        expect(dailyRepo.saved).toHaveLength(0);
    });

    it("range 생략 시 기본 1.5년 범위로 조회", async () => {
        const { service, dailyProvider } = makeService({
            daily: [candle("2026-06-26", "70000")],
            today: "2026-06-28",
        });
        await service.ingestDailyCandles("005930");
        expect(dailyProvider.calls[0]).toEqual({ from: "2024-12-28", to: "2026-06-28" });
    });

    it("DB 비어 있으면 그냥 증분 저장(healed=false)", async () => {
        const { service, dailyRepo } = makeService({
            daily: [candle("2026-06-25", "70000"), candle("2026-06-26", "71000")],
        });
        const r = await service.ingestDailyCandles("005930", { from: "2026-06-20", to: "2026-06-28" });
        expect(r.healed).toBe(false);
        expect(r.saved).toBe(2);
        expect(dailyRepo.rows.size).toBe(2);
    });

    it("경계봉 일치 → 증분 저장만(자가치유 안 함)", async () => {
        const repo = new FakeDailyRepo();
        await repo.saveDailyCandles([candle("2024-12-30", "60000"), candle("2026-06-25", "70000")]);
        repo.saved = []; // seed 기록 리셋
        const { service, dailyProvider } = makeService({
            repo,
            daily: [candle("2026-06-25", "70000"), candle("2026-06-26", "71000")],
        });
        const r = await service.ingestDailyCandles("005930", { from: "2026-06-25", to: "2026-06-28" });
        expect(r.healed).toBe(false);
        // 단발 조회만(전체 재수집 두 번째 호출 없음)
        expect(dailyProvider.calls).toHaveLength(1);
        expect(repo.rows.get("005930|2026-06-26")?.krx.close).toBe("71000");
    });

    it("경계봉 불일치 → 저장된 전체(earliest~to) 재수집·덮어쓰기(healed=true)", async () => {
        const repo = new FakeDailyRepo();
        // 옛 기준으로 저장된 과거 데이터
        await repo.saveDailyCandles([
            candle("2024-12-30", "60000"),
            candle("2026-06-25", "70000"),
        ]);
        repo.saved = [];
        // 액분 등으로 소급조정된 새 시리즈(경계 2026-06-25 값이 다름) + 신규일
        const adjusted = [
            candle("2024-12-30", "30000"),
            candle("2026-06-25", "35000"),
            candle("2026-06-26", "35500"),
        ];
        const { service, dailyProvider } = makeService({
            repo,
            daily: adjusted,
            today: "2026-06-28",
        });
        const r = await service.ingestDailyCandles("005930", { from: "2026-06-25", to: "2026-06-28" });

        expect(r.healed).toBe(true);
        expect(r.saved).toBe(3); // 전체 재수집분
        // 2번째 호출 = earliest(2024-12-30) ~ to
        expect(dailyProvider.calls[1]).toEqual({ from: "2024-12-30", to: "2026-06-28" });
        // 과거봉까지 새 기준으로 덮임
        expect(repo.rows.get("005930|2024-12-30")?.krx.close).toBe("30000");
        expect(repo.rows.get("005930|2026-06-25")?.krx.close).toBe("35000");
    });

    it("volume 만 달라도 자가치유 트리거(액분 시 거래량 배수 변화)", async () => {
        const repo = new FakeDailyRepo();
        await repo.saveDailyCandles([candle("2026-06-25", "70000", "100")]);
        repo.saved = [];
        const { service } = makeService({
            repo,
            daily: [candle("2026-06-25", "70000", "5000"), candle("2026-06-26", "70000", "5100")],
        });
        const r = await service.ingestDailyCandles("005930", { from: "2026-06-25", to: "2026-06-28" });
        expect(r.healed).toBe(true);
    });
});

describe("ingestMinuteCandles", () => {
    it("provider 가 준 봉을 그대로 적재", async () => {
        const minute: MinuteCandle[] = [
            { stockCode: "005930", date: "2026-06-26", time: "09:00:00", krx: null, un: { open: "1", high: "1", low: "1", close: "1", volume: "1" } },
        ];
        const { service, minuteRepo } = makeService({ daily: [], minute });
        const r = await service.ingestMinuteCandles("005930", "2026-06-26");
        expect(r).toEqual({ stockCode: "005930", date: "2026-06-26", saved: 1 });
        expect(minuteRepo.saved).toHaveLength(1);
    });
});
