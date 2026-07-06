import type { DailyIssue } from "#domain";

// 당일 이슈 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 편집모델은 행 단위 add/remove 뿐 — in-place 수정 없음("수정"=remove 후 add).
// (date, stockCode, issue) 자연키로 행을 정확히 지목. 자세한 설계는 domain/classification/dailyIssue.ts.

/** 당일 이슈 조회(읽기). 보드 요약(DayBoards)·리뷰 소비자가 의존. */
export interface DailyIssueReader {
    /** 하루의 전체 이슈 행(issue·종목 정렬). 리뷰 + (date,issue) 그룹핑용. */
    getByDate(date: string): Promise<DailyIssue[]>;
}

/** 당일 이슈 편집(쓰기). 이슈 확정 편집 컨트롤러가 의존. */
export interface DailyIssueStore {
    /**
     * 행 단위 추가(멱등). (date, stockCode, issue) 가 이미 있으면 무시한다(ON CONFLICT DO NOTHING) —
     * 1차 분류기를 다시 돌려도 사람이 고친 행(author·comment)을 덮지 않게.
     */
    add(issues: DailyIssue[]): Promise<void>;

    /** 특정 행 삭제. "수정"은 remove 후 add 로 표현한다. */
    remove(date: string, stockCode: string, issue: string): Promise<void>;
}
