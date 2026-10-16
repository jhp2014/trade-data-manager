// DayFlow 조립 — tdm api 의 DerivedCache.doBuild(파일 베이크·완료판정·테마 조인 포함)를 재현하지 않고,
// 같은 재료(universe·분봉·원주가/수정주가 일봉·시총)를 요청마다 직계산한다(결정 로그 「trade-lab 편입」:
// /day-replay 는 재현하지 않는다 — lab 전용 /day-flow). 종목당 파생은 core deriveMinutes 그대로.
import {
    deriveMinutes,
    subtractMonths,
    mapWithConcurrency,
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
            const d = deriveMinutes(code, minutes, raw, adj, date);
            if (d === null) return null; // 분봉 없음(이론상 universe 밖) → skip
            return {
                code,
                times: d.times,
                rate: d.rate,
                high: d.high,
                low: d.low,
                open: d.open,
                cumAmount: d.cumAmount,
                basePrice: d.basePrice,
                marketCap: capByCode.get(code) ?? null,
            };
        });
        return { date, stocks: built.filter((s): s is DayFlowStock => s !== null) };
    };
}
