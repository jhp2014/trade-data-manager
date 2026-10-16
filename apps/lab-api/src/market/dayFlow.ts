// DayFlow 조립 — tdm api 의 DerivedCache.doBuild(파일 베이크·완료판정·테마 조인 포함)를 재현하지 않고,
// 같은 재료(universe·분봉·원주가/수정주가 일봉·시총)를 요청마다 직계산한다.
// 계약 원칙(결정 로그 「trade-lab 편입」): **서버 = 분당 사실 + 기준가, 표현(%·누적·기준 전환)은 전부 클라.**
// 그래서 core deriveMinutes(% 선계산)를 쓰지 않고 같은 재료 단계(densifyMinutes + basePricesOf +
// computeMinuteTradingAmount + kstToUnix)로 분당 원값만 담는다 — dense 타임라인(빈 분 flat-fill, 대금 0)은 동일.
import {
    basePricesOf,
    computeMinuteTradingAmount,
    densifyMinutes,
    kstToUnix,
    mapWithConcurrency,
    subtractMonths,
    RAW_DAILY_LOOKBACK_MONTHS,
    type AdjustedDailyReader,
    type DailyMarketCapReader,
    type DailyUniverseProvider,
    type MinuteReader,
    type RawDailyReader,
} from "@trade-data-manager/market";
import type { DayFlow, DayFlowStock } from "@trade-data-manager/wire";

/** 종목당 fetch 인플라이트 상한(분봉+일봉 2벌) — api DerivedCache 와 같은 수준. */
const FETCH_CONCURRENCY = 8;

export interface DayFlowDeps {
    universe: DailyUniverseProvider;
    minute: MinuteReader;
    rawDaily: RawDailyReader;
    /** 수정주가 일봉 — basePricesOf 의 이벤트(감자·액분) 보정 재료(원주가와 대조). */
    adjDaily: AdjustedDailyReader;
    marketCap: DailyMarketCapReader;
}

/** GET /day-flow 의 포트 — app.ts 는 이 함수 하나만 주입받는다. */
export type DayFlowByDate = (date: string) => Promise<DayFlow>;

export function makeDayFlowByDate({ universe, minute, rawDaily, adjDaily, marketCap }: DayFlowDeps): DayFlowByDate {
    return async (date) => {
        const codes = await universe.stockCodesByDate(date);
        if (codes.length === 0) return { date, stocks: [] };
        // 시총은 **직전 거래일** 행 — 저장값이 KRX 정의(당일 종가×당일 주식수)라 그대로 쓰면 그날 등락이 섞인다.
        const caps = await marketCap.getPreviousByDateAndCodes(date, codes);
        const capByCode = new Map(caps.map((c) => [c.stockCode, c.marketCap]));
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };

        const built = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code): Promise<DayFlowStock | null> => {
            const [minutes, raw, adj] = await Promise.all([
                minute.getMinuteCandles(code, date),
                rawDaily.getRawDailyCandles(code, range),
                adjDaily.getDailyCandles(code, range),
            ]);
            const dense = densifyMinutes(minutes);
            if (dense.length === 0) return null; // 분봉 없음(이론상 universe 밖) → skip

            const n = dense.length;
            const times = new Array<number>(n);
            const close = new Array<number>(n);
            const high = new Array<number>(n);
            const low = new Array<number>(n);
            const amount = new Array<number>(n);
            for (let i = 0; i < n; i++) {
                const m = dense[i];
                times[i] = kstToUnix(m.date, m.time);
                close[i] = Number(m.un.close);
                high[i] = Number(m.un.high);
                low[i] = Number(m.un.low);
                amount[i] = Number(computeMinuteTradingAmount(m.un));
            }
            return {
                code,
                times,
                close,
                high,
                low,
                amount,
                open: Number(dense[0].un.open),
                basePrice: basePricesOf(raw, adj, date).base,
                marketCap: capByCode.get(code) ?? null,
            };
        });
        return { date, stocks: built.filter((s): s is DayFlowStock => s !== null) };
    };
}
