import type { DailyIssue } from "../../../../domain/index.js";

/**
 * 당일 이슈 저장 포트(outbound). 편집모델은 행 단위 add/delete 뿐 — in-place 수정 없음("수정"=remove 후 add).
 * 그래서 (date, stockCode, issue) 자연키로 행을 정확히 지목한다. 자세한 설계는 domain/dailyIssue.ts.
 */
export interface DailyIssueRepository {
    /**
     * 행 단위 추가(멱등). (date, stockCode, issue) 가 이미 있으면 무시한다(ON CONFLICT DO NOTHING) —
     * 1차 분류기를 다시 돌려도 사람이 고친 행(author·comment)을 덮지 않게.
     */
    add(issues: DailyIssue[]): Promise<void>;

    /** 특정 행 삭제. "수정"은 remove 후 add 로 표현한다. */
    remove(date: string, stockCode: string, issue: string): Promise<void>;

    /** 하루의 전체 이슈 행(issue·종목 정렬). 리뷰 + (date,issue) 그룹핑용. */
    getByDate(date: string): Promise<DailyIssue[]>;
}
