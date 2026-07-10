/**
 * 데이터 있는 거래일 목록 조회(query, 앱 대면) — data-aware 날짜피커용(전역, 종목무관).
 * 소스는 분봉(장중 데이터 실보유일) — [[MinuteDateReader]] 기반. 구현(apps/api DataDatesCache)은
 * cold 1회 전체 distinct → 파일 캐시, 이후 warm 파일 read + 하루 1회 꼬리 증분.
 * (일봉은 ~2년 딥 백필이라 장중데이터 없는 과거일까지 나와 피커엔 부적합.)
 */
export interface DataDateReader {
    /** 데이터(분봉) 있는 모든 거래일(YYYY-MM-DD, 오름차순). */
    listDataDates(): Promise<string[]>;
}
