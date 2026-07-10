/**
 * 분봉 데이터가 있는 거래일 목록(query, out) — data-aware 날짜피커의 실소스.
 * after 를 주면 그 날짜 초과분만 반환한다: 분봉은 trade_date 월별 RANGE 파티션이라
 * `trade_date > after` 가 과거 달 파티션을 통째로 프루닝 → 최신 파티션만 스캔하는 저렴한 꼬리 갱신용.
 */
export interface MinuteDateReader {
    /** 분봉 있는 거래일(YYYY-MM-DD, 오름차순). after 지정 시 after < trade_date 만. */
    listMinuteDates(after?: string): Promise<string[]>;
}
