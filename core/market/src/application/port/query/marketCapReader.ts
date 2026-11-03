import type { DailyMarketCap, DateRange } from "#domain";

/**
 * 날짜별 시총 조회(query) — 그 거래일 시총을 코드 배치로. 리뷰 리더가 universe 종목 시총 stitch 용.
 * 미백필 종목은 결과에서 빠진다(호출자가 code 로 맞추고 없으면 null 처리).
 */
export interface DailyMarketCapReader {
    /**
     * **date 직전 거래일**의 시총 — 코드 배치. 소비자가 실제로 원하는 건 대개 이쪽이다.
     * 저장값은 KRX 정의라 "그 날 종가 × 그 날 상장주식수"(당일 기준)인데, 하루를 보는 관점에서
     * 시총은 **아침에 이미 정해져 있는 그릇 크기**여야 한다 — 그게 전일 종가 × 전일 상장주식수,
     * 곧 D-1 행이다. 당일 행을 쓰면 그날 등락이 시총에 섞여 모수가 결과에 의존한다(필터 경계가 값이라
     * 로그 척도로 가려지지도 않는다). decisions.md 「시가총액·상장주식수 소스 (KRX)」 절.
     *
     * 돌아오는 행의 `date` 는 **직전 거래일**이다(요청한 date 가 아니다) — 호출자는 stockCode 로 맞춘다.
     * 직전 거래일은 종목마다 다를 수 있다(신규상장·거래정지) → 종목별 최신 1행.
     */
    getPreviousByDateAndCodes(date: string, codes: string[]): Promise<DailyMarketCap[]>;
}

/**
 * 한 종목의 일별 시총 **시계열**(query) — 행 그대로(그 날 종가 × 그 날 상장주식수, 당일 기준), 날짜 오름차순.
 * "차트 날짜 D 의 아침 시총"이 필요하면 소비자가 D 보다 앞선 마지막 행을 고른다(위 D-1 규칙 — 여기서 미리 밀지 않는다).
 * 범위 양끝은 선택 — 빠진 쪽은 열린 끝(전 기간). ISP: 배치 리더(DailyMarketCapReader)와 따로 둔다 — 소비자가 다르다.
 */
export interface DailyMarketCapSeriesReader {
    getMarketCapSeries(stockCode: string, range: Partial<DateRange>): Promise<DailyMarketCap[]>;
}
