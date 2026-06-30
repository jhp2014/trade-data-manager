import type { DailyIssue } from "../../../../domain/index.js";

/**
 * 당일 이슈 확정 편집(쓰기 Command). 행 단위 add/delete 두 연산뿐 — "수정"=remove 후 add.
 * 리뷰 초안(메모리)을 사람이 확정하면 author 박힌 DailyIssue 가 되어 여기로 들어온다.
 * UI 와 무관하게 시그니처 고정 — 얇은 use case(영속 어댑터로 forward).
 */
export interface IssueEditor {
    /** 확정 행 추가(멱등 — ON CONFLICT DO NOTHING). 분류기 재실행이 사람 편집 안 덮게. */
    addIssues(issues: DailyIssue[]): Promise<void>;
    /** 특정 행 삭제. "수정"은 remove 후 add 로 표현. */
    removeIssue(date: string, stockCode: string, issue: string): Promise<void>;
}
