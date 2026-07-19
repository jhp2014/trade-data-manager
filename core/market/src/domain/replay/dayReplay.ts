// 당일 복기 파생값(day-replay) — 그날 raw(분봉+원주가일봉)+수정주가 일봉 → 종목별 순수 파생. domain(I/O 0).
//  · deriveMinutes → per-minute % 시계열 + 분봉 open%/high%(테마 음봉·꼬리) + trailingHighs(수정, KRX/UN 두벌). 복기 파일 원자재.
//  · themeStatsOf  → 그 파생값에서 테마보드 EOD(bucketCounts·trailingHighs) 재계산(분봉 재조회 0).
// 분봉 % 시계열은 기준가 UN(basePricesOf — 원주가 직전 종가에 감자·액분 조정계수 보정) 대비 한 벌 —
// KRX 기준 %는 클라가 basePrice 두 스칼라로 일차변환(krx% = (unBase/krxBase)×(100+un%)−100, 동치. 파일 이중화 불필요).
// trailingHighs 는 **수정주가**(액분·권리락 시 옛 매물대를 현재 스케일로 정확 매핑) — 시장별 자기 전일종가 대비, 교차 없음.
import type { MinuteCandle, DailyCandle, DailyBar, PreviousClose, ByMarket } from "../candle/model.js";
import { densifyMinutes } from "../candle/minuteBackfill.js";
import { basePricesOf, computeMinuteTradingAmount } from "../candle/price.js";
import { countAmountBuckets, DEFAULT_COUNTING_POLICY, type CountingPolicy, type DerivedMinute } from "../board/amount.js";
import { kstToUnix } from "../kst.js";

/** trailingHighs 배열 길이(최대 거래일). 클라가 이 안에서 20/40/…/120 창을 슬라이스. */
export const TRAILING_DAYS = 120;
/** trailingHighs(120거래일) 를 확실히 덮을 원주가 일봉 조회 창(캘린더). 9개월 ≈ ≥180 거래일 여유. */
export const RAW_DAILY_LOOKBACK_MONTHS = 9;

/** KST 오프셋(초). 저장된 unix(UTC) times 를 자정기준 분으로 되돌릴 때 쓴다. */
const KST_OFFSET_SEC = 9 * 3600;

/**
 * 당일 EOD 일봉 파생(불변) — 수정주가 일봉 바를 같은 시장 직전 종가 대비 %로. **조정 불변**이라 파일에 굽는다
 * (자가치유가 close·prevClose 를 같은 계수로 곱해도 비율 보존). amount(거래대금)는 원.
 */
export interface DayStats {
    changeRate: number; // 종가 %
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: string; // 그날 거래대금(원, 무손실 string)
}

/** 수정주가 일봉 바 + 같은 시장 직전 종가 → EOD %. base 없으면 당일 시가 폴백, 0 이면 null(파생 불가). */
export function dailyStatsOf(bar: DailyBar, prevClose: string | null): DayStats | null {
    const base = Number(prevClose ?? bar.open);
    if (base === 0) return null;
    const pct = (v: string): number => r2(((Number(v) - base) / base) * 100);
    return { changeRate: pct(bar.close), openPct: pct(bar.open), highPct: pct(bar.high), lowPct: pct(bar.low), amount: bar.amount };
}

/** KRX·UN 두 벌 EOD % — 각 시장은 자기 바 + 자기 전일종가로만(교차 없음). 보드 기준가 토글의 원자재. */
export function dailyStatsByMarket(candle: DailyCandle, prev: PreviousClose | null): ByMarket<DayStats | null> {
    return {
        krx: dailyStatsOf(candle.krx, prev?.krxClose ?? null),
        un: dailyStatsOf(candle.un, prev?.unClose ?? null),
    };
}

/** 복기 파생값(파일 캐시 단위). 가격 시계열은 % (원주가 UN base 대비 한 벌), 거래대금만 원. */
export interface MinuteDerived {
    code: string;
    times: number[]; // unix seconds(UTC)
    rate: number[]; // 등락률 %(분당 종가) / 분
    high: number[]; // running 고가 % / 분
    low: number[]; // running 저가 % / 분
    open: number; // 당일 시가 %(스칼라) — 눕힌 캔들 몸통
    cumAmount: number[]; // 누적 거래대금(원) / 분
    minuteOpen: number[]; // 분봉 시가 % / 분 — 테마 음봉/꼬리 판정
    minuteHigh: number[]; // 분봉 고가 % / 분 — 테마 음봉/꼬리 판정
    trailingHighs: ByMarket<number[]>; // 매 거래일 high%(수정주가, 시장별 자기 전일종가 대비, index=daysAgo, 0=당일, 최대 TRAILING_DAYS)
    basePrice: ByMarket<number | null>; // 등락률 기준가(당일 원주가 스케일, 이벤트 보정) — 분봉 % KRX 재기저(일차변환)·기준가 토글용
    baseFactor: ByMarket<number>; // 기준가 조정계수(평상 1) — ≠1: 이벤트(감자·액분) 보정 또는 데이터 이상. 트립와이어 로그용(와이어 미노출)
}

/** 테마보드용 EOD 파생값(파일에서 재계산). */
export interface ThemeStats {
    code: string;
    bucketCounts: number[]; // EOD 거래대금 구간 횟수 — 테마보드 hover
    trailingHighs: ByMarket<number[]>; // 신고가 근접 필터(파일에서 그대로 복사)
}

/** 복기 파생 번들(파일 캐시 단위). */
export interface DayReplay {
    date: string;
    stocks: MinuteDerived[];
}

/** 테마 파생 번들(요청 때 file 에서 재계산). */
export interface DayTheme {
    date: string;
    stocks: ThemeStats[];
}

/** % 값 소수 2자리 반올림 — 소비측도 2자리라 무손실 + payload 다이어트. */
function r2(x: number): number {
    return Math.round(x * 100) / 100;
}

/**
 * % 재기저(일차변환) — fromBase 대비 %를 toBase 대비 %로. 같은 가격 v 에서 나온 %라 수학적 동치:
 * v = fromBase×(1+pct/100) → (v−toBase)/toBase×100 = fromBase×(100+pct)/toBase − 100.
 * 복기·라이브 보드의 KRX 기준가 토글이 UN% 시계열을 즉석 변환(파일·와이어 이중화 불필요).
 */
export function rebasePct(pct: number, fromBase: number, toBase: number): number {
    return r2((fromBase * (100 + pct)) / toBase - 100);
}

/** date 직전(미만) 최신 캔들의 시장별 close(숫자). 없으면(상장 첫날 등) null. */
export function prevClosesOf(daily: DailyCandle[], date: string): ByMarket<number | null> {
    let prev: DailyCandle | null = null;
    for (const c of daily) {
        if (c.date < date && (!prev || c.date > prev.date)) prev = c;
    }
    const num = (v: string | undefined): number | null => {
        const n = Number(v);
        return v !== undefined && Number.isFinite(n) && n !== 0 ? n : null;
    };
    return { krx: num(prev?.krx.close), un: num(prev?.un.close) };
}

/**
 * 수정주가 일봉 창 → trailingHighs%(KRX/UN 두 벌, index=daysAgo, 0=당일).
 * 각 시장 base = 자기 시장 수정주가 직전 종가(교차 없음) — 수정주가라 액분·권리락 시 옛 매물대가
 * 현재 가격 스케일로 정확히 매핑되고, %는 조정 불변(분자·분모 같은 계수). base 없으면 빈 배열.
 * (live 엔진도 이 함수를 그대로 사용 — 실시간·복기 매물대 판정 잣대 단일진실.)
 */
export function trailingHighsOf(adjDaily: DailyCandle[], date: string): ByMarket<number[]> {
    const upto = [...adjDaily].filter((c) => c.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const prev = prevClosesOf(upto, date);
    const recent = upto.slice(-TRAILING_DAYS).reverse();
    const per = (market: "krx" | "un"): number[] => {
        const base = prev[market];
        if (base === null) return [];
        return recent.map((c) => r2(((Number(c[market].high) - base) / base) * 100));
    };
    return { krx: per("krx"), un: per("un") };
}

/**
 * 복기 파생 계산. 분봉 없으면 null(스킵). 분봉 % 시계열 = UN(통합) 한 벌 — base 는 기준가(basePricesOf:
 * 원주가 직전 종가 + 감자·액분 조정계수 보정. 평상일엔 원주가 전일종가와 항등).
 * base 폴백(상장일): 당일 첫 분봉 시가. trailingHighs 는 수정주가 일봉(adjDaily)에서 KRX/UN 두 벌.
 */
export function deriveMinutes(
    code: string,
    rawMinutes: MinuteCandle[],
    rawDaily: DailyCandle[],
    adjDaily: DailyCandle[],
    date: string,
): MinuteDerived | null {
    const minutes = densifyMinutes(rawMinutes);
    if (minutes.length === 0) return null;

    const trailingHighs = trailingHighsOf(adjDaily, date);
    const bp = basePricesOf(rawDaily, adjDaily, date);
    const base = bp.base.un ?? Number(minutes[0].un.open);
    const pct = (won: number): number => (base === 0 ? 0 : r2(((won - base) / base) * 100));

    const n = minutes.length;
    const times = new Array<number>(n);
    const rate = new Array<number>(n);
    const high = new Array<number>(n);
    const low = new Array<number>(n);
    const cumAmount = new Array<number>(n);
    const minuteOpen = new Array<number>(n);
    const minuteHigh = new Array<number>(n);

    let hi = -Infinity;
    let lo = Infinity;
    let cum = 0;
    for (let i = 0; i < n; i++) {
        const m = minutes[i];
        const o = Number(m.un.open);
        const h = Number(m.un.high);
        const l = Number(m.un.low);
        const c = Number(m.un.close);
        hi = Math.max(hi, h);
        lo = Math.min(lo, l);
        cum += Number(
            computeMinuteTradingAmount({ open: m.un.open, high: m.un.high, low: m.un.low, close: m.un.close, volume: m.un.volume }),
        );
        times[i] = kstToUnix(m.date, m.time);
        rate[i] = pct(c);
        high[i] = pct(hi);
        low[i] = pct(lo);
        cumAmount[i] = cum;
        minuteOpen[i] = pct(o);
        minuteHigh[i] = pct(h);
    }

    return { code, times, rate, high, low, open: pct(Number(minutes[0].un.open)), cumAmount, minuteOpen, minuteHigh, trailingHighs, basePrice: bp.base, baseFactor: bp.factor };
}

/**
 * 복기 파생값(MinuteDerived) → 카운팅 정책 입력(DerivedMinute[]). 분봉 재조회 0.
 *  · amountWon — 누적 거래대금(cumAmount)의 인접 차분으로 분봉 거래대금 복원.
 *  · minuteOfDay — times(unix UTC)를 KST 자정기준 분으로 되돌려 시간창 판정.
 * uptoIndex 지정 시 [0..uptoIndex] 만(복기 보드의 시점 t 누적). 서버(themeStatsOf)·클라(복기 hover/필터) 공유 — 같은 자.
 * 파라미터는 쓰는 필드만 Pick — 클라는 와이어 부분집합(ReplayStock, baseFactor 미노출)으로도 호출 가능.
 */
export function derivedMinutesOf(
    md: Pick<MinuteDerived, "times" | "rate" | "cumAmount" | "minuteOpen" | "minuteHigh">,
    uptoIndex: number = md.times.length - 1,
): DerivedMinute[] {
    const n = Math.min(uptoIndex + 1, md.times.length);
    const mins: DerivedMinute[] = new Array(Math.max(0, n));
    for (let i = 0; i < n; i++) {
        mins[i] = {
            minuteOfDay: Math.floor(((md.times[i] + KST_OFFSET_SEC) % 86400) / 60),
            openPct: md.minuteOpen[i],
            highPct: md.minuteHigh[i],
            closePct: md.rate[i],
            amountWon: md.cumAmount[i] - (i > 0 ? md.cumAmount[i - 1] : 0),
        };
    }
    return mins;
}

/**
 * 파일 파생값(MinuteDerived) → 테마보드 EOD. 분봉 재조회 0.
 *  · bucketCounts — derivedMinutesOf(하루 전체)에 카운팅 정책 재적용.
 *  · trailingHighs — 파일에서 그대로.
 */
export function themeStatsOf(md: MinuteDerived, policy: CountingPolicy = DEFAULT_COUNTING_POLICY): ThemeStats {
    return { code: md.code, bucketCounts: countAmountBuckets(derivedMinutesOf(md), policy), trailingHighs: md.trailingHighs };
}
