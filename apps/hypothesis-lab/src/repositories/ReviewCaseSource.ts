/**
 * data-core(public.review_target/review_point)를 읽는 단일 인터페이스.
 *
 * hypothesis-lab 이 data-core 를 읽는 유일한 지점. 후보 목록(working set 소스),
 * caseId 값 enrich(렌더링), 고아 점검(reconciliation)을 모두 담당한다.
 * 읽기 전용이며, VIEW 자체는 hypothesis 스냅샷으로 자급자족한다.
 */

export type ReviewCase = {
    caseId: string;
    stockCode: string;
    stockName: string | null;
    tradeDate: string; // YYYY-MM-DD
    tradeTime: string | null; // HH:MM (null = groupId)
};

export interface ReviewCaseSource {
    /** 주어진 caseId 들의 실재 review 값(stockName 등). review_point 에 없는 것은 결과에서 빠진다. */
    enrich(caseIds: string[]): Promise<ReviewCase[]>;
    /** 최근 review point N개(일자·시각 내림차순). */
    listRecent(limit: number): Promise<ReviewCase[]>;
    /** 특정 기간([from,to] YYYY-MM-DD, 양끝 포함)의 review point. */
    listByRange(from: string, to: string): Promise<ReviewCase[]>;
    /** 주어진 caseId 중 review_point(권위)에 실재하지 않는 것(고아 caseId). */
    findOrphans(caseIds: string[]): Promise<string[]>;
}
