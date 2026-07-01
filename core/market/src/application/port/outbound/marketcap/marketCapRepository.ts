import type { DailyMarketCap } from "#domain";

/**
 * 날짜별 시총 영속화(ISP). (stockCode, date) 자연키 upsert.
 * 별 테이블(daily_market_cap) — 자가치유 일봉 overwrite 가 안 닿는다.
 */
export interface DailyMarketCapRepository {
    saveMarketCaps(rows: DailyMarketCap[]): Promise<void>;
    /**
     * 그 거래일 시총을 코드 배치로 조회(read). 리뷰 리더가 universe 종목 시총 stitch 용.
     * 미백필 종목은 결과에서 빠진다(호출자가 code 로 맞추고 없으면 null 처리).
     */
    getByDateAndCodes(date: string, codes: string[]): Promise<DailyMarketCap[]>;
}
