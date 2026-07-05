// ReplayReadService — ReplayReader(inbound) 구현. 유니버스 코드 → (분봉 ∪ 원주가일봉) fetch → deriveMinutes.
// 캐시 무지(순수 오케스트레이션) — 파일 캐시는 apps/api 어댑터(DerivedStore)가 이 위에 씌운다.
import type { MinuteCandleRepository, RawDailyCandleRepository, DailyUniverseProvider } from "#port/outbound";
import type { ReplayReader } from "#port/inbound";
import { deriveMinutes, RAW_DAILY_LOOKBACK_MONTHS, type MinuteDerived, type DayReplay } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { subtractMonths } from "../shared/dailyRange.js";

/** 종목별 fetch 인플라이트 상한(분봉+원주가일봉). 날짜당 1회라 넉넉히. */
const FETCH_CONCURRENCY = 8;

export interface ReplayReadDeps {
    universe: DailyUniverseProvider;
    minute: MinuteCandleRepository;
    rawDaily: RawDailyCandleRepository;
}

export class ReplayReadService implements ReplayReader {
    constructor(private readonly deps: ReplayReadDeps) {}

    async dayReplay(date: string): Promise<DayReplay> {
        const codes = await this.deps.universe.stockCodesByDate(date);
        const range = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };
        const reduced = await mapWithConcurrency(codes, FETCH_CONCURRENCY, async (code) => {
            const [minutes, rawDaily] = await Promise.all([
                this.deps.minute.getMinuteCandles(code, date),
                this.deps.rawDaily.getRawDailyCandles(code, range),
            ]);
            return deriveMinutes(code, minutes, rawDaily, date);
        });
        return { date, stocks: reduced.filter((s): s is MinuteDerived => s !== null) };
    }
}
