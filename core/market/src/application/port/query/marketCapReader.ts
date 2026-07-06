import type { DailyMarketCap } from "#domain";

/**
 * 날짜별 시총 조회(query) — 그 거래일 시총을 코드 배치로. 리뷰 리더가 universe 종목 시총 stitch 용.
 * 미백필 종목은 결과에서 빠진다(호출자가 code 로 맞추고 없으면 null 처리).
 */
export interface DailyMarketCapReader {
    getByDateAndCodes(date: string, codes: string[]): Promise<DailyMarketCap[]>;
}
