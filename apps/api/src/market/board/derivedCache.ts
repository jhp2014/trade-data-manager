// DerivedCache — 날짜별 불변 스냅샷 파일 캐시(빌드 조율 + in-flight dedup). 조립은 DayBoards.
// core 복합서비스를 감싸지 않고 query 포트를 **직접** 호출 + 순수함수(deriveMinutes·dailyStatsOf)로 빌드한다.
//   cold: universe → EOD 스칼라 배치(일봉·전일종가·시총) + 종목당 분봉파생(제한 동시성) → (과거면) 파일 저장
//   warm: 파일 read-through (과거는 불변이라 무한 유효)
//   오늘: 수집중일 수 있어 파일로 안 굳히고 매 요청 재빌드(부분 상태 영구화 방지). isCacheable(date < KST today) 게이트.
import {
    deriveMinutes,
    dailyStatsByMarket,
    kstToday,
    RAW_DAILY_LOOKBACK_MONTHS,
    subtractMonths,
    mapWithConcurrency,
    type DailyUniverseProvider,
    type MinuteReader,
    type RawDailyReader,
    type AdjustedDailyReader,
    type DailyCandleSnapshotReader,
    type DailyMarketCapReader,
} from "@trade-data-manager/market";
import { fileSnapshotStore, SNAPSHOT_SCHEMA_VERSION, type DaySnapshot, type DaySnapshotFile, type DaySnapshotStore } from "./daySnapshotCache.js";

/** 종목당 fetch 인플라이트 상한(분봉+원주가일봉). 날짜당 1회 빌드라 넉넉히. */
const FETCH_CONCURRENCY = 8;

export interface DerivedCacheDeps {
    universe: DailyUniverseProvider;
    minute: MinuteReader;
    rawDaily: RawDailyReader;
    /** 수정주가 일봉 창(종목당 range) — trailingHighs(KRX/UN 두벌, 수정주가) 원자재. */
    adjDaily: AdjustedDailyReader;
    dailyCandle: DailyCandleSnapshotReader;
    marketCap: DailyMarketCapReader;
    /** 스냅샷 저장소(기본 파일 gzip). 테스트는 in-memory fake. */
    store?: DaySnapshotStore;
    /** 오늘(KST) 공급자(기본 kstToday). 오늘은 수집중일 수 있어 영구캐시 제외 — 테스트 주입용. */
    today?: () => string;
}

export class DerivedCache {
    private readonly inFlight = new Map<string, Promise<DaySnapshotFile>>();
    private readonly store: DaySnapshotStore;
    private readonly today: () => string;

    constructor(private readonly deps: DerivedCacheDeps) {
        this.store = deps.store ?? fileSnapshotStore;
        this.today = deps.today ?? kstToday;
    }

    // 영구 캐시 대상 = 과거 거래일(오늘 미만). 오늘은 수집(20:30 스윕)이 진행 중일 수 있어
    // 부분 스냅샷을 굳히면 영구 오염 → 파일로 안 굳히고 매 요청 재빌드한다.
    private isCacheable(date: string): boolean {
        return date < this.today();
    }

    /** 그 거래일 스냅샷. 과거면 warm 파일 우선, 오늘/cold 면 1회 빌드(오늘은 파일로 안 굳힘). */
    async snapshot(date: string): Promise<DaySnapshotFile> {
        if (this.isCacheable(date)) {
            const hit = await this.store.read(date);
            if (hit) return hit;
        }
        return this.build(date);
    }

    // 날짜별 in-flight 공유 — 같은 cold 날짜로 테마+복기가 겹쳐도 빌드는 한 번만.
    private build(date: string): Promise<DaySnapshotFile> {
        const existing = this.inFlight.get(date);
        if (existing) return existing;
        const p = this.doBuild(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        return p;
    }

    private async doBuild(date: string): Promise<DaySnapshotFile> {
        const cacheable = this.isCacheable(date);
        if (cacheable) {
            const again = await this.store.read(date); // 다른 요청이 이미 구웠으면 재사용
            if (again) return again;
        }
        const codes = await this.deps.universe.stockCodesByDate(date);
        // universe 가 비면(오늘 EOD 전·미수집일) 빈 스냅샷을 굳히지 않는다 —
        // 이후 데이터가 들어와도 빈 캐시가 영구히 남는 걸 막고, 다음 요청이 재빌드하게 둔다.
        if (codes.length === 0) return { v: SNAPSHOT_SCHEMA_VERSION, date, stocks: [] };
        // EOD 스칼라(일봉·전일종가·시총)는 배치 1회. 분봉파생은 종목당 fetch(제한 동시성).
        const [candles, prevCloses, caps] = await Promise.all([
            this.deps.dailyCandle.getByDateAndCodes(date, codes),
            this.deps.dailyCandle.getPreviousCloses(date, codes),
            this.deps.marketCap.getByDateAndCodes(date, codes),
        ]);
        const candleByCode = new Map(candles.map((c) => [c.stockCode, c]));
        const prevByCode = new Map(prevCloses.map((p) => [p.stockCode, p])); // 시장별(krx·un) 전일종가 둘 다 사용
        const capByCode = new Map(caps.map((c) => [c.stockCode, c.marketCap]));
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };

        const built = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code): Promise<DaySnapshot | null> => {
            const [minutes, rawDaily, adjDaily] = await Promise.all([
                this.deps.minute.getMinuteCandles(code, date),
                this.deps.rawDaily.getRawDailyCandles(code, range),
                this.deps.adjDaily.getDailyCandles(code, range),
            ]);
            const derived = deriveMinutes(code, minutes, rawDaily, adjDaily, date);
            if (derived === null) return null; // 분봉 없음(이론상 universe 밖) → skip
            const candle = candleByCode.get(code);
            return {
                code,
                marketCap: capByCode.get(code) ?? null,
                stats: candle ? dailyStatsByMarket(candle, prevByCode.get(code) ?? null) : { krx: null, un: null },
                minutes: derived,
            };
        });
        const file: DaySnapshotFile = { v: SNAPSHOT_SCHEMA_VERSION, date, stocks: built.filter((s): s is DaySnapshot => s !== null) };
        this.reportBaseAdjustments(file);
        // 과거 날짜만 파일로 굳힌다. 오늘은 수집 진행 중일 수 있어 부분 상태를 영구화하지 않고 반환만.
        if (cacheable) await this.store.write(file);
        return file;
    }

    // 기준가 보정 트립와이어 — factor ≠ 1 종목 집계. 평상시 0~수 종목(실제 감자·액분 이벤트)이 정상.
    // 수십 종목 이상이면 이벤트일 수 없다 → 일봉 파이프라인 사고(원주가·수정주가 불일치, 예: 장중 백필로 비최종 종가
    // 동결) 신호. 2026-07-03 전시장 원주가 오염이 이 침묵 속에서 복기 %를 틀었다 — 재발 시 여기서 즉시 드러난다.
    private reportBaseAdjustments(file: DaySnapshotFile): void {
        const flagged = file.stocks.filter((s) => s.minutes.baseFactor.krx !== 1 || s.minutes.baseFactor.un !== 1);
        if (flagged.length === 0) return;
        const sample = flagged
            .slice(0, 5)
            .map((s) => `${s.code}(un×${s.minutes.baseFactor.un.toFixed(4)})`)
            .join(" ");
        const msg = `[day-snapshot] ${file.date} 기준가 보정 ${flagged.length}종목: ${sample}`;
        if (flagged.length > 50) console.error(`${msg} — 🚨 전시장급, 일봉 수집사고 의심(원주가·수정주가 불일치)`);
        else console.warn(msg);
    }
}
