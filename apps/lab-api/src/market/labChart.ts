// lab 차트 두 경로 — /daily(수정주가 일봉 + 유령 보정 unFix) · /minutes(하루 분봉 + % 기준가 + 수정주가 환산비).
// 옛 /chart 묶음(일봉 2년 + 분봉)을 나눈 것: 일봉은 기간을 마음대로(왼쪽으로 더 받기), 분봉은 날짜마다 따로.
// 유령 판정·값은 core ghostFixOf(분봉 원주가) — 여기는 후보 고르기·분봉 읽기·수정주가 환산·캐시만.
import {
    basePricesOf,
    densifyMinutes,
    ghostFixOf,
    kstToday,
    rawScaleOf,
    subtractMonths,
    RAW_DAILY_LOOKBACK_MONTHS,
    type AdjustedDailyReader,
    type DailyCandle,
    type GhostFix,
    type MinuteReader,
    type RawDailyReader,
} from "@trade-data-manager/market";
import type { DailyUnFix, LabDailyCandle, LabMinuteDay } from "@trade-data-manager/wire";

export interface LabChartDeps {
    dailyCandle: AdjustedDailyReader;
    rawDailyCandle: RawDailyReader;
    minuteCandle: MinuteReader;
    /** 오늘(KST YYYY-MM-DD) — 오늘 분봉은 수집이 채우는 중일 수 있어 보정을 캐시하지 않는다. 테스트 주입용. */
    today?: () => string;
}

export type DailyWithFix = (stockCode: string, range: { from: string; to: string }) => Promise<LabDailyCandle[]>;
export type MinutesByDate = (stockCode: string, date: string) => Promise<LabMinuteDay>;

/** 후보 — UN 극값이 KRX 밖에 있는 날(고가가 더 높거나 저가가 더 낮다 = 그 값이 NXT 단독 시간에 찍혔다). */
const isCandidate = (c: DailyCandle): boolean =>
    Number(c.un.high) > Number(c.krx.high) || Number(c.un.low) < Number(c.krx.low);

/** 원주가 → 수정주가(일봉 스케일) 정수. */
const toAdj = (raw: string, scale: number): number => Math.round(Number(raw) / scale);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * 판정(원주가) → 그 날 일봉에 얹을 UN* 칸(수정주가). 걷어 낸 값은 정의상 UN ⊇ KRX 범위 안이다 —
 * 고가 ∈ [KRX 고가, UN 고가], 저가 ∈ [UN 저가, KRX 저가], 시가 ∈ [UN* 저가, UN* 고가]. 수정계수(종가 비율)의
 * 반올림이 키움의 수정주가 반올림과 따로 놀아 1원 어긋나거나, 원주가 일봉이 비어 계수가 1로 물러난 날을 여기서 막는다.
 */
function unFixOf(c: DailyCandle, fix: GhostFix, scale: number): DailyUnFix {
    const n = (v: string) => Number(v);
    const unFix: DailyUnFix = {};
    const high = fix.high !== undefined ? clamp(toAdj(fix.high, scale), n(c.krx.high), n(c.un.high)) : n(c.un.high);
    const low = fix.low !== undefined ? clamp(toAdj(fix.low, scale), n(c.un.low), n(c.krx.low)) : n(c.un.low);
    if (fix.high !== undefined) unFix.high = String(high);
    if (fix.low !== undefined) unFix.low = String(low);
    if (fix.open !== undefined) unFix.open = String(clamp(toAdj(fix.open, scale), low, high));
    return unFix;
}

const FIX_CACHE_MAX = 50_000; // (종목, 날짜) 판정 — 지난 날은 바뀌지 않는다. 한 줄이 작아 넉넉히
const MINUTE_READ_CONCURRENCY = 8;

export function makeLabChart({ dailyCandle, rawDailyCandle, minuteCandle, today = kstToday }: LabChartDeps): {
    dailyWithFix: DailyWithFix;
    minutesByDate: MinutesByDate;
} {
    // 판정(원주가 스케일) 캐시 — 수정계수는 이벤트 때 바뀌므로 환산은 매번 한다.
    const fixCache = new Map<string, GhostFix | null>();
    const ghostOf = async (code: string, date: string): Promise<GhostFix | null> => {
        const key = `${code}@${date}`;
        const hit = fixCache.get(key);
        if (hit !== undefined) return hit;
        const minutes = await minuteCandle.getMinuteCandles(code, date);
        const fix = ghostFixOf(minutes); // 분봉 없는 날 = null(UN 그대로 — 보정 못 함)
        // 분봉이 없는 날은 캐시하지 않는다 — 늦게 수집(백필·자가치유)되면 다음 요청에서 보정이 붙는다.
        if (date < today() && minutes.length > 0) {
            if (fixCache.size >= FIX_CACHE_MAX) fixCache.delete(fixCache.keys().next().value!);
            fixCache.set(key, fix);
        }
        return fix;
    };

    const dailyWithFix: DailyWithFix = async (code, range) => {
        const [daily, rawDaily] = await Promise.all([
            dailyCandle.getDailyCandles(code, range),
            rawDailyCandle.getRawDailyCandles(code, range),
        ]);
        const candidates = daily.filter(isCandidate).map((c) => c.date);
        const fixes = new Map<string, GhostFix | null>();
        for (let i = 0; i < candidates.length; i += MINUTE_READ_CONCURRENCY) {
            const chunk = candidates.slice(i, i + MINUTE_READ_CONCURRENCY);
            const got = await Promise.all(chunk.map((d) => ghostOf(code, d)));
            chunk.forEach((d, j) => fixes.set(d, got[j]));
        }
        return daily.map((c) => {
            const fix = fixes.get(c.date);
            return fix ? { ...c, unFix: unFixOf(c, fix, rawScaleOf(rawDaily, daily, c.date)) } : c;
        });
    };

    const minutesByDate: MinutesByDate = async (code, date) => {
        // 원주가는 직전 거래일 종가를 찾을 만큼 넉넉히(휴장·거래정지 갭 흡수 — 옛 /chart 와 같은 창).
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };
        const [minutes, rawDaily, daily] = await Promise.all([
            minuteCandle.getMinuteCandles(code, date),
            rawDailyCandle.getRawDailyCandles(code, range),
            dailyCandle.getDailyCandles(code, range),
        ]);
        const { base } = basePricesOf(rawDaily, daily, date);
        return {
            stockCode: code,
            date,
            minutes: densifyMinutes(minutes),
            basePrice: base.krx === null && base.un === null ? null : base,
            rawScale: rawScaleOf(rawDaily, daily, date),
        };
    };

    return { dailyWithFix, minutesByDate };
}
