import type { DailyMarketCap } from "#domain";

/**
 * 날짜별 시총 저장(collect). (stockCode, date) 자연키 upsert. 별 테이블(daily_market_cap).
 * 자가치유 일봉 overwrite 가 안 닿는다. (읽기 조회는 query 의 DailyMarketCapReader 로 분리.)
 */
export interface DailyMarketCapStore {
    saveMarketCaps(rows: DailyMarketCap[]): Promise<void>;
}
