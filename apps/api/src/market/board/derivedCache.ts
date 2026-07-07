// DerivedCache — 날짜별 불변 스냅샷 파일 캐시(빌드 조율 + in-flight dedup). 조립은 DayBoards.
// core 복합서비스를 감싸지 않고 query 포트를 **직접** 호출 + 순수함수(deriveMinutes·dailyStatsOf)로 빌드한다.
//   cold: universe → EOD 스칼라 배치(일봉·전일종가·시총) + 종목당 분봉파생(제한 동시성) → 파일 저장
//   warm: 파일 read-through (과거는 불변이라 무한 유효)
import {
    deriveMinutes,
    dailyStatsOf,
    RAW_DAILY_LOOKBACK_MONTHS,
    subtractMonths,
    mapWithConcurrency,
    type DailyUniverseProvider,
    type MinuteReader,
    type RawDailyReader,
    type DailyCandleSnapshotReader,
    type DailyMarketCapReader,
} from "@trade-data-manager/market";
import { readSnapshot, writeSnapshot, type DaySnapshot, type DaySnapshotFile } from "./daySnapshotCache.js";

/** 종목당 fetch 인플라이트 상한(분봉+원주가일봉). 날짜당 1회 빌드라 넉넉히. */
const FETCH_CONCURRENCY = 8;

export interface DerivedCacheDeps {
    universe: DailyUniverseProvider;
    minute: MinuteReader;
    rawDaily: RawDailyReader;
    dailyCandle: DailyCandleSnapshotReader;
    marketCap: DailyMarketCapReader;
}

export class DerivedCache {
    private readonly inFlight = new Map<string, Promise<void>>();

    constructor(private readonly deps: DerivedCacheDeps) {}

    /** 그 거래일 스냅샷. warm 이면 즉시, cold 면 1회 빌드 후 읽는다. */
    async snapshot(date: string): Promise<DaySnapshotFile> {
        const hit = await readSnapshot(date);
        if (hit) return hit;
        await this.build(date);
        return (await readSnapshot(date)) ?? { date, stocks: [] };
    }

    // 날짜별 in-flight 공유 — 같은 cold 날짜로 테마+복기가 겹쳐도 빌드는 한 번만.
    private build(date: string): Promise<void> {
        const existing = this.inFlight.get(date);
        if (existing) return existing;
        const p = this.doBuild(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        return p;
    }

    private async doBuild(date: string): Promise<void> {
        if (await readSnapshot(date)) return; // 다른 요청이 이미 구웠으면 skip
        const codes = await this.deps.universe.stockCodesByDate(date);
        // universe 가 비면(오늘 EOD 전·미수집일) 빈 스냅샷을 파일로 굳히지 않는다 —
        // 이후 데이터가 들어와도 빈 캐시가 영구히 남는 걸 막고, 다음 요청이 재빌드하게 둔다.
        if (codes.length === 0) return;
        // EOD 스칼라(일봉·전일종가·시총)는 배치 1회. 분봉파생은 종목당 fetch(제한 동시성).
        const [candles, prevCloses, caps] = await Promise.all([
            this.deps.dailyCandle.getByDateAndCodes(date, codes),
            this.deps.dailyCandle.getPreviousCloses(date, codes),
            this.deps.marketCap.getByDateAndCodes(date, codes),
        ]);
        const candleByCode = new Map(candles.map((c) => [c.stockCode, c]));
        const prevUnByCode = new Map(prevCloses.map((p) => [p.stockCode, p.unClose]));
        const capByCode = new Map(caps.map((c) => [c.stockCode, c.marketCap]));
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };

        const built = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code): Promise<DaySnapshot | null> => {
            const [minutes, rawDaily] = await Promise.all([
                this.deps.minute.getMinuteCandles(code, date),
                this.deps.rawDaily.getRawDailyCandles(code, range),
            ]);
            const derived = deriveMinutes(code, minutes, rawDaily, date);
            if (derived === null) return null; // 분봉 없음(이론상 universe 밖) → skip
            const candle = candleByCode.get(code);
            return {
                code,
                marketCap: capByCode.get(code) ?? null,
                stats: candle ? dailyStatsOf(candle, prevUnByCode.get(code) ?? null) : null,
                minutes: derived,
            };
        });
        await writeSnapshot({ date, stocks: built.filter((s): s is DaySnapshot => s !== null) });
    }
}
