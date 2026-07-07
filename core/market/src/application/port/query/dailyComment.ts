import type { DailyComment } from "#domain";

// 당일 종목 코멘트 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// comment 가 자연키 밖이라 갱신 가능 → 편집은 upsert/remove(review_points.memo 선례).
// (date, stockCode) 자연키로 행을 정확히 지목. 자세한 설계는 domain/classification/dailyComment.ts.

/** 당일 코멘트 조회(읽기). 보드 요약(DayBoards)이 의존. */
export interface DailyCommentReader {
    /** 하루의 전체 코멘트 행(종목 정렬). */
    getByDate(date: string): Promise<DailyComment[]>;
}

/** 당일 코멘트 편집(쓰기). 코멘트 편집 컨트롤러가 의존. */
export interface DailyCommentStore {
    /** (date, stockCode) 기준 upsert — 이미 있으면 comment·author 갱신, 없으면 삽입. */
    upsert(comment: DailyComment): Promise<void>;

    /** 특정 종목 당일 코멘트 삭제(빈 코멘트 = 삭제). */
    remove(date: string, stockCode: string): Promise<void>;
}
