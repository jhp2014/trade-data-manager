import type { DailyStockStat, DateRange, MissingStatFill } from "#domain";

/**
 * 일별 종목 속성 저장(collect). (stockCode, date) 자연키 upsert. 별 테이블(daily_market_cap) —
 * 자가치유 일봉 overwrite 가 안 닿는다. (읽기 조회는 query 의 DailyMarketCapReader 로 분리.)
 */
export interface DailyStockStatStore {
    saveDailyStats(rows: DailyStockStat[]): Promise<void>;
    /**
     * 소스가 안 준 거래분을 메운다 — **그 종목의 마지막 거래일만**(그 종목 일봉이 뒤로 없고, 시장
     * 일봉은 뒤로 있는 자리 = 상장폐지·스팩 소멸). 값 = 직전 행 상장주식수 × 그날 원주가 KRX 종가
     * (실측 8건 전부 옛 역산값과 전수 일치). 나머지 구멍은 채우지 않고 센다.
     */
    fillMissingTradedDays(range: DateRange): Promise<MissingStatFill>;
}
