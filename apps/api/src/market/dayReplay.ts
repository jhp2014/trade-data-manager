// 당일 파생값(day-derived) — 두 소비자, 두 빌더. 둘 다 그날 raw(분봉+원주가일봉) 순회에서 파생:
//  · deriveMinutes   → 복기보드용 per-minute 시계열(times·rate·high·low·open·cumAmount) = MinuteDerived. 파일 캐시.
//  · buildThemeStats → 테마보드용 EOD 스칼라(bucketCounts·trailingHighs)          = ThemeStats.    in-memory 캐시.
// 공유 fetch·이중 build·캐시 라우팅은 DerivedStore 가 소유(raw 1회 조회로 둘 다). 설계: [[day-reduction-cache-design]].
//
// 모든 %는 **원주가 직전 거래일 종가(base)** 대비 — 분봉이 원주가라 base 도 원주가여야 스케일이 맞고,
// 같은 분모라 두 %의 뺄셈이 곧 가격 갭이 된다. 거래대금만 원. 계산은 core domain 순수함수.
import {
    densifyMinutes,
    computeMinuteTradingAmount,
    amountBucketIndex,
    shouldCountMinute,
    AMOUNT_BUCKET_COUNT,
    DEFAULT_COUNTING_POLICY,
} from "@trade-data-manager/market";
import type { MinuteCandle, DailyCandle, CountingPolicy } from "@trade-data-manager/market";

/** trailingHighs 배열 길이(최대 거래일). 클라가 이 안에서 20/40/…/120 창을 슬라이스. */
export const TRAILING_DAYS = 120;
/** trailingHighs(120거래일) 를 확실히 덮을 원주가 일봉 조회 창(캘린더). 9개월 ≈ ≥180 거래일 여유. */
export const RAW_DAILY_LOOKBACK_MONTHS = 9;

/** 복기보드용 per-minute 파생값. 가격 시계열은 % (원주가 base 대비), 거래대금만 원. */
export interface MinuteDerived {
    code: string;
    times: number[]; // unix seconds(UTC)
    rate: number[]; // 등락률 %(분당 종가) / 분
    high: number[]; // running 고가 % / 분
    low: number[]; // running 저가 % / 분
    open: number; // 당일 시가 %(스칼라) — 눕힌 캔들 몸통
    cumAmount: number[]; // 누적 거래대금(원) / 분
}

/** 테마보드용 EOD 파생값(분봉 순회 산출). */
export interface ThemeStats {
    code: string;
    bucketCounts: number[]; // EOD 거래대금 구간 횟수(길이 AMOUNT_BUCKET_COUNT) — 테마보드 hover
    trailingHighs: number[]; // 매 거래일 high%(index=daysAgo, 0=당일, 최대 TRAILING_DAYS) — 신고가 근접 필터
}

/** 복기 파생 번들(파일 캐시 단위). */
export interface DayReplay {
    date: string;
    stocks: MinuteDerived[];
}

/** 테마 파생 번들(메모리 캐시 단위). */
export interface DayTheme {
    date: string;
    stocks: ThemeStats[];
}

/** KST(UTC+9) date+time(HH:MM:SS) → unix seconds. */
function kstToUnix(date: string, time: string): number {
    return Math.floor(Date.parse(`${date}T${time}+09:00`) / 1000);
}

/** % 값 소수 2자리 반올림 — 소비측도 2자리라 무손실 + payload 다이어트(부동소수 17자리 직렬화 방지). */
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
    const recent = upto.slice(-TRAILING_DAYS).reverse(); // index0 = 가장 최근(≤date, 보통 당일)
    return { base, trailingHighs: recent.map((c) => r2(((Number(c.un.high) - base) / base) * 100)) };
}

/**
 * 복기보드용 per-minute 파생. 분봉 없으면 null(스킵). 시장 = UN(통합). 분봉은 densify(채움정책 단일진실).
 * base 폴백(상장일): 당일 첫 분봉 시가 → 분봉 %는 그대로 계산.
 */
export function deriveMinutes(
    code: string,
    rawMinutes: MinuteCandle[],
    rawDaily: DailyCandle[],
    date: string,
): MinuteDerived | null {
    const minutes = densifyMinutes(rawMinutes);
    if (minutes.length === 0) return null;

    const { base: dailyBase } = baseAndTrailing(rawDaily, date);
    const base = dailyBase ?? Number(minutes[0].un.open);
    const pct = (won: number): number => (base === 0 ? 0 : r2(((won - base) / base) * 100));

    const n = minutes.length;
    const times = new Array<number>(n);
    const rate = new Array<number>(n);
    const high = new Array<number>(n);
    const low = new Array<number>(n);
    const cumAmount = new Array<number>(n);

    let hi = -Infinity;
    let lo = Infinity;
    let cum = 0;
    for (let i = 0; i < n; i++) {
        const m = minutes[i];
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
    }

    return { code, times, rate, high, low, open: pct(Number(minutes[0].un.open)), cumAmount };
}

/**
 * 테마보드용 EOD 파생. 분봉 없으면 null(스킵). 시장 = UN.
 *  · bucketCounts — 카운팅정책(시간 창·꼬리없는음봉 제외) 통과 분봉의 거래대금 구간 카운트.
 *  · trailingHighs — 원주가 일봉 창의 매 거래일 high%(base 없으면 빈 배열).
 * per-minute 시계열은 만들지 않는다(테마보드가 안 씀). 채움봉(vol 0)은 거래대금 0이라 카운트 무영향 → raw 순회로 충분.
 */
export function buildThemeStats(
    code: string,
    rawMinutes: MinuteCandle[],
    rawDaily: DailyCandle[],
    date: string,
    policy: CountingPolicy = DEFAULT_COUNTING_POLICY,
): ThemeStats | null {
    if (rawMinutes.length === 0) return null;

    const { trailingHighs } = baseAndTrailing(rawDaily, date);
    const bucketCounts = new Array<number>(AMOUNT_BUCKET_COUNT).fill(0);

    for (const m of rawMinutes) {
        const minAmount = Number(
            computeMinuteTradingAmount({ open: m.un.open, high: m.un.high, low: m.un.low, close: m.un.close, volume: m.un.volume }),
        );
        if (
            shouldCountMinute(
                { time: m.time, open: Number(m.un.open), high: Number(m.un.high), low: Number(m.un.low), close: Number(m.un.close) },
                policy,
            )
        ) {
            const idx = amountBucketIndex(minAmount);
            if (idx >= 0) bucketCounts[idx] += 1;
        }
    }

    return { code, bucketCounts, trailingHighs };
}
