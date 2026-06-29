import type { DailyMarketCap } from "../../../domain/index.js";

/**
 * 날짜별 시총 영속화(ISP). (stockCode, date) 자연키 upsert.
 * 별 테이블(daily_market_cap) — 자가치유 일봉 overwrite 가 안 닿는다.
 */
export interface DailyMarketCapRepository {
    saveMarketCaps(rows: DailyMarketCap[]): Promise<void>;
}
