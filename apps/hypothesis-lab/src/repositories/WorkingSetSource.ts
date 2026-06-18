/**
 * 워킹셋 = "지금 스코프인 caseId 집합".
 *
 * 어디서 오는지(시트 / data-core 필터 / 스냅샷)는 구현체가 정하고,
 * 렌더링 파이프라인은 이 인터페이스만 안다. 덕분에 소스 선택/fallback 을
 * 나중에 view 에서 끼워넣을 수 있다.
 */
export interface WorkingSetSource {
    listCaseIds(): Promise<string[]>;
}
