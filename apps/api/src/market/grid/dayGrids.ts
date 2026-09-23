// DayGrids — 하루 우주의 **날짜 격자**(그날 유니버스 전 종목) 빌더 + 파일 캐시. 규칙: .claude/decisions.md
// 「하루 타점 — 서버가 날짜 격자를 굽고 클라가 조건으로 뽑는다」.
//
// ## 전용 빌더 — 스냅샷 빌드(DerivedCache)에 얹지 않는다
// 얹어서 아끼는 건 cold 1회 분봉 재읽기(~2초 / 스냅샷 8.6초)뿐이고, 격자 규칙만 바뀌었을 때(버전 상향)
// 도는 전용 경로가 어차피 필요하다 — 두 경로가 되느니 처음부터 하나다. 스냅샷에서 기준가를 빌리지도
// 않는다: 오늘은 스냅샷이 굳지 않아 격자 요청마다 스냅샷 재빌드가 한 번 더 돈다.
//
// ## 무엇을 굽나 — 순수 지형
// zigzag 1% · floor 0 · 밴드 3% · 기준선 모름(core `DAY_GRID_DETECT_OPTIONS`). 기준선·게이트·해상도는
// 전부 클라 읽기 시점이다 — 그래서 과거 날짜 번들은 **불변**이다(기준선을 고쳐도 무효화가 없다).
//
// ## 수명 — 스냅샷과 같은 규칙
// 과거 ∧ 수집 완료 = 파일로 굳힘(무한 유효) · 오늘·미완료 = 굳히지 않고 메모리 메모(60초)만.
// 완료 판정은 스냅샷과 **한 벌**(`isMinuteCollectionComplete`) — 스냅샷 파일 존재(`isSealed`)로 대신하면
// 격자가 스냅샷보다 먼저 불린 cold 날짜가 영영 안 굳는다.
import {
    basePricesOf,
    DAY_GRID_DETECT_OPTIONS,
    detectGrid,
    encodeChartGrid,
    kstToday,
    mapWithConcurrency,
    POINT_GRID_RULE_VERSION,
    subtractMonths,
    type AdjustedDailyReader,
    type DailyUniverseProvider,
    type MinuteReader,
    type RawDailyReader,
    type WireChartGrid,
} from "@trade-data-manager/market";
import type { DayGridBundle } from "@trade-data-manager/wire";
import { isMinuteCollectionComplete, type CompletionScanReader } from "../board/minuteCompletion.js";
import type { DayGridStore } from "./dayGridStore.js";

/** 종목당 읽기 동시성 — 스냅샷·격자 굽기와 같은 값(커넥션 풀 포화 방지). */
const FETCH_CONCURRENCY = 8;
/** 그날 기준가 조회 창 — pointGrids 의 BASE_LOOKBACK_MONTHS 와 같은 이유(직전 거래일 하나면 된다). */
const BASE_LOOKBACK_MONTHS = 1;
/** 굳지 않은 번들(오늘·미완료)의 메모 수명 — 클라의 오늘 재조회 박자(60초)와 같다. */
const VOLATILE_TTL_MS = 60_000;
/** 메모 상한(날짜 수) — 번들 하나가 파싱 후 수 MB 라 넉넉히 둘 이유가 없다. */
const MEMO_CAP = 4;

export interface DayGridsDeps {
    universe: DailyUniverseProvider;
    scan: CompletionScanReader;
    minute: MinuteReader;
    rawDaily: RawDailyReader;
    adjDaily: AdjustedDailyReader;
    store: DayGridStore;
    today?: () => string;
    now?: () => number;
}

interface Memo {
    bundle: DayGridBundle;
    /** 파일로 굳었나 — 굳은 것만 만료가 없다. */
    sealed: boolean;
    at: number;
}

export class DayGrids {
    private readonly inFlight = new Map<string, Promise<Memo>>();
    private readonly memo = new Map<string, Memo>();
    private readonly today: () => string;
    private readonly now: () => number;

    constructor(private readonly deps: DayGridsDeps) {
        this.today = deps.today ?? kstToday;
        this.now = deps.now ?? Date.now;
    }

    async bundle(date: string): Promise<DayGridBundle> {
        const m = this.memo.get(date);
        if (m && (m.sealed || this.now() - m.at < VOLATILE_TTL_MS)) {
            this.touch(date, m);
            return m.bundle;
        }
        const existing = this.inFlight.get(date);
        if (existing) return (await existing).bundle;
        const p = this.load(date).finally(() => this.inFlight.delete(date));
        this.inFlight.set(date, p);
        const made = await p;
        this.touch(date, made);
        return made.bundle;
    }

    private touch(date: string, m: Memo): void {
        this.memo.delete(date);
        this.memo.set(date, m);
        while (this.memo.size > MEMO_CAP) this.memo.delete(this.memo.keys().next().value as string);
    }

    private async load(date: string): Promise<Memo> {
        const cacheable = date < this.today();
        if (cacheable) {
            const hit = await this.deps.store.read(date);
            if (hit) return { bundle: hit, sealed: true, at: this.now() };
        }
        const codes = await this.deps.universe.stockCodesByDate(date);
        const bundle: DayGridBundle = { version: POINT_GRID_RULE_VERSION, opts: { ...DAY_GRID_DETECT_OPTIONS }, date, charts: [] };
        // 유니버스가 비면(오늘 EOD 전·미수집일) 빈 번들을 굳히지 않는다 — 스냅샷과 같은 이유.
        if (codes.length === 0) return { bundle, sealed: false, at: this.now() };

        const range = { from: subtractMonths(date, BASE_LOOKBACK_MONTHS), to: date };
        const charts = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code): Promise<WireChartGrid | null> => {
            const [minutes, rawDay, adjDay] = await Promise.all([
                this.deps.minute.getMinuteCandles(code, date),
                this.deps.rawDaily.getRawDailyCandles(code, range),
                this.deps.adjDaily.getDailyCandles(code, range),
            ]);
            // 그날 기준가(당일 % 의 분모) — /point-grids 와 같은 정의(basePricesOf). 검출엔 안 쓰인다.
            const dayBase = basePricesOf(rawDay, adjDay, date).base;
            const grid = detectGrid(minutes, { base: null, prevBase: dayBase.un, prevBaseKrx: dayBase.krx }, DAY_GRID_DETECT_OPTIONS);
            return grid === null ? null : encodeChartGrid(code, grid);
        });
        bundle.charts = charts.filter((c): c is WireChartGrid => c !== null);

        let sealed = false;
        if (cacheable && (await isMinuteCollectionComplete(this.deps.scan, date, new Set(codes), "day-grid"))) {
            // 저장은 best-effort — 번들은 이미 메모리에 있다(디스크 실패로 응답을 죽이지 않는다).
            try {
                await this.deps.store.write(bundle);
                sealed = true;
            } catch (err) {
                console.warn(`[day-grid] ${date} 캐시 쓰기 실패 — 메모리 결과는 그대로 서빙`, err);
            }
        }
        return { bundle, sealed, at: this.now() };
    }
}
