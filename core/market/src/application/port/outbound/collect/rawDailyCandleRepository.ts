import type { DailyCandle, DateRange, MarketCloses } from "#domain";

/**
 * 원주가(미수정) 일봉 저장/조회 포트(ISP — 원주가 능력만). 구현은 infra/db(Drizzle).
 * daily_candles(수정주가·자가치유)와 의도적으로 분리한다: 원주가는 사후 불변이라 **append-only**
 * (이미 저장된 (종목,날)은 유지 — onConflictDoNothing). 소급조정 자가치유가 이 저장소엔 닿지 않는다.
 * 쓰임: 분봉 %기준(전일 원종가) + 수정계수 역산(수정close/원close). 시간 오름차순.
 */
export interface RawDailyCandleRepository {
    /** 원주가 일봉 저장 — 불변이라 append-only(이미 있으면 유지). */
    saveRawDailyCandles(candles: DailyCandle[]): Promise<void>;
    /** 종목의 [from,to] 원주가 일봉(날짜 오름차순). */
    getRawDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]>;
    /** 종목의 가장 과거 저장 원주가 거래일(YYYY-MM-DD). 백필 하한 판단용. 없으면 null. */
    getEarliestRawDailyDate(stockCode: string): Promise<string | null>;
    /**
     * 그 종목의 date 직전 거래일 **원주가** 종가(시장별). 분봉 % 기준가 전용 — 전체 원주가 일봉을
     * 클라에 내리지 않고 이 스칼라만 번들에 실어준다. date 이전 캔들 없으면(상장 첫날 등) null.
     */
    getPreviousRawClose(stockCode: string, date: string): Promise<MarketCloses | null>;
}
