// 당일 복기 파생값(day-replay) — 그날 raw(분봉+원주가일봉) → 종목별 순수 파생. domain(I/O 0).
//  · deriveMinutes → per-minute % 시계열 + 분봉 open%/high%(테마 음봉·꼬리) + trailingHighs. 복기 파일 원자재.
//  · themeStatsOf  → 그 파생값에서 테마보드 EOD(bucketCounts·trailingHighs) 재계산(분봉 재조회 0).
// 모든 %는 원주가 직전 거래일 종가(base) 대비 — 분봉이 원주가라 base 도 원주가여야 스케일이 맞다. 거래대금만 원.
import type { MinuteCandle, DailyCandle } from "../candle/model.js";
import { densifyMinutes } from "../candle/minuteBackfill.js";
import { computeMinuteTradingAmount } from "../candle/price.js";
import { countAmountBuckets, DEFAULT_COUNTING_POLICY, type CountingPolicy, type DerivedMinute } from "../board/amount.js";
import { kstToUnix } from "../kst.js";

/** trailingHighs 배열 길이(최대 거래일). 클라가 이 안에서 20/40/…/120 창을 슬라이스. */
export const TRAILING_DAYS = 120;
/** trailingHighs(120거래일) 를 확실히 덮을 원주가 일봉 조회 창(캘린더). 9개월 ≈ ≥180 거래일 여유. */
export const RAW_DAILY_LOOKBACK_MONTHS = 9;

/** KST 오프셋(초). 저장된 unix(UTC) times 를 자정기준 분으로 되돌릴 때 쓴다. */
const KST_OFFSET_SEC = 9 * 3600;

/**
 * 당일 EOD 일봉 파생(불변) — 수정주가 일봉을 직전 거래일 종가 대비 %로. **조정 불변**이라 파일에 굽는다
 * (자가치유가 close·prevClose 를 같은 계수로 곱해도 비율 보존). 시장 = UN(통합). amount(거래대금)는 원.
 */
export interface DayStats {
    changeRate: number; // 종가 %
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: string; // 그날 거래대금(원, 무손실 string)
}

/** 수정주가 일봉 + 직전 UN 종가 → EOD %. base 없으면 당일 시가 폴백, 0 이면 null(파생 불가). */
export function dailyStatsOf(candle: DailyCandle, prevCloseUn: string | null): DayStats | null {
    const un = candle.un;
    const base = Number(prevCloseUn ?? un.open);
    if (base === 0) return null;
    const pct = (v: string): number => r2(((Number(v) - base) / base) * 100);
    return { changeRate: pct(un.close), openPct: pct(un.open), highPct: pct(un.high), lowPct: pct(un.low), amount: un.amount };
}

/** 복기 파생값(파일 캐시 단위). 가격 시계열은 % (원주가 base 대비), 거래대금만 원. */
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
    trailingHighs: number[]; // 매 거래일 high%(index=daysAgo, 0=당일, 최대 TRAILING_DAYS) — 테마 신고가 근접 필터
}

/** 테마보드용 EOD 파생값(파일에서 재계산). */
export interface ThemeStats {
    code: string;
    bucketCounts: number[]; // EOD 거래대금 구간 횟수 — 테마보드 hover
    trailingHighs: number[]; // 신고가 근접 필터(파일에서 그대로 복사)
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
 * 원주가 일봉 창 → base(직전 거래일 UN 종가) + trailingHighs%(index=daysAgo).
 * base 없으면(상장 첫날 등) trailing 은 빈 배열(폴백 base 로 상대 비교는 무의미).
 */
function baseAndTrailing(rawDaily: DailyCandle[], date: string): { base: number | null; trailingHighs: number[] } {
    const upto = [...rawDaily].filter((c) => c.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const before = upto.filter((c) => c.date < date);
    const base = before.length > 0 ? Number(before[before.length - 1].un.close) : null;
    if (base === null || base === 0) return { base, trailingHighs: [] };
    const recent = upto.slice(-TRAILING_DAYS).reverse();
    return { base, trailingHighs: recent.map((c) => r2(((Number(c.un.high) - base) / base) * 100)) };
}

/**
 * 복기 파생 계산. 분봉 없으면 null(스킵). 시장 = UN(통합). 분봉은 densify(채움정책 단일진실).
 * base 폴백(상장일): 당일 첫 분봉 시가. per-minute open%/high% 와 trailingHighs 까지 통째 저장.
 */
export function deriveMinutes(
    code: string,
    rawMinutes: MinuteCandle[],
    rawDaily: DailyCandle[],
    date: string,
): MinuteDerived | null {
    const minutes = densifyMinutes(rawMinutes);
    if (minutes.length === 0) return null;

    const { base: dailyBase, trailingHighs } = baseAndTrailing(rawDaily, date);
    const base = dailyBase ?? Number(minutes[0].un.open);
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

    return { code, times, rate, high, low, open: pct(Number(minutes[0].un.open)), cumAmount, minuteOpen, minuteHigh, trailingHighs };
}

/**
 * 파일 파생값(MinuteDerived) → 테마보드 EOD. 분봉 재조회 0.
 *  · bucketCounts — 분봉 거래대금(cumAmount 인접 차분) + open%/high%/close%(rate) 로 카운팅 정책 재적용.
 *  · trailingHighs — 파일에서 그대로. times 는 unix(UTC)라 KST 자정기준 분으로 되돌려 시간창 판정.
 */
export function themeStatsOf(md: MinuteDerived, policy: CountingPolicy = DEFAULT_COUNTING_POLICY): ThemeStats {
    const mins: DerivedMinute[] = new Array(md.times.length);
    for (let i = 0; i < md.times.length; i++) {
        mins[i] = {
            minuteOfDay: Math.floor(((md.times[i] + KST_OFFSET_SEC) % 86400) / 60),
            openPct: md.minuteOpen[i],
            highPct: md.minuteHigh[i],
            closePct: md.rate[i],
            amountWon: md.cumAmount[i] - (i > 0 ? md.cumAmount[i - 1] : 0),
        };
    }
    return { code: md.code, bucketCounts: countAmountBuckets(mins, policy), trailingHighs: md.trailingHighs };
}
