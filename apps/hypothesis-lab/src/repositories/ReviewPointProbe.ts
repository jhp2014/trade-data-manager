/**
 * 고아 caseId 점검의 권위 소스 접근.
 *
 * hypothesis-lab 이 data-core(public.review_target/review_point)를 읽는 유일한 지점.
 * 인터페이스로 격리해 나머지 앱은 review 도메인과 분리 상태를 유지한다.
 * "고아"는 에러가 아니라 정보다 — 보고 거꾸로 chart-review 에서 point 를 찍을 수도 있다.
 */

export type ReconcileCase = {
    caseId: string;
    stockCode: string;
    tradeDate: string; // YYYY-MM-DD
    tradeTime: string | null; // HH:MM (null = groupId, point 단위 매칭 불가)
};

export type OrphanCase = ReconcileCase;

export interface ReviewPointProbe {
    /**
     * 주어진 case 중 review_point(권위)에 실재하지 않는 것(고아)을 가려낸다.
     * - tradeTime 있음: (stockCode, tradeDate, tradeTime) 가 review_point 에 있어야 실재.
     * - tradeTime 없음: (stockCode, tradeDate) review_target 존재 여부로만 판정.
     */
    findOrphans(cases: ReconcileCase[]): Promise<OrphanCase[]>;
}
