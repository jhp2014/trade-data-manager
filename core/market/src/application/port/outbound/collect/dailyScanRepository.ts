import type { DailyCandle, DateRange } from "#domain";

/**
 * 일봉 스캔 조회 포트(ISP — 프루닝 입력용 읽기). 한 거래일의 *전종목* 을 본다.
 * ingest 의 종목별 포트(DailyCandleRepository)와 분리 — 소비자(프루닝)가 다르다.
 * 구현은 같은 daily_candles(Drizzle).
 */
export interface DailyScanRepository {
    /** 해당 거래일 전종목 일봉. 거래 데이터 없으면 빈 배열. */
    listDailyCandlesByDate(date: string): Promise<DailyCandle[]>;
    /** date 직전의 데이터 있는 거래일(YYYY-MM-DD). 고가등락률 기준가(전일종가)용. 없으면 null. */
    getPreviousTradingDate(date: string): Promise<string | null>;
    /** 저장된 일봉의 가장 최근 거래일(전체 종목). 일봉 커버리지 확인용. 없으면 null. */
    getLatestDailyDate(): Promise<string | null>;
    /** [from,to] 안에 일봉(거래분)이 있는 종목 코드 distinct. 시총 백필 대상 유니버스. */
    listTradedStockCodes(range: DateRange): Promise<string[]>;
}
