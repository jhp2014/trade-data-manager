/**
 * 데이터(일봉) 있는 거래일 목록 조회(query) — data-aware 날짜피커용(전역, 종목무관).
 * daily_candles 의 distinct 거래일. 구현은 Drizzle 일봉 repo(별도 소스 신설 없이 재사용).
 */
export interface DataDateReader {
    /** 데이터 있는 모든 거래일(YYYY-MM-DD, 오름차순). */
    listDataDates(): Promise<string[]>;
}
