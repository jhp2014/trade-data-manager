import type { DailyComment } from "#domain";

// 당일 종목 코멘트 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// comment 가 자연키 밖이라 갱신 가능 → 편집은 upsert/remove(review_points.memo 선례).
// (date, stockCode) 자연키로 행을 정확히 지목. 자세한 설계는 domain/classification/dailyComment.ts.

/** 당일 코멘트 조회(읽기) — 전량 하나. 소비자(클라 복제본 피드·DayBoards)가 전량을 받아 각자 거른다:
 *  사람 편집 규모라 페이징·하루 필터 SQL 이 불필요(anchors listAll 선례).
 *  (옛 getOne — 팝업 프리필 단건 — 과 getByDate — 보드 하루치 — 는 소비측 필터가 흡수하며 은퇴.) */
export interface DailyCommentReader {
    listAll(): Promise<DailyComment[]>;
}

/** 당일 코멘트 편집(쓰기). 코멘트 편집 컨트롤러가 의존. */
export interface DailyCommentStore {
    /** (date, stockCode) 기준 upsert — 이미 있으면 comment·author 갱신, 없으면 삽입. */
    upsert(comment: DailyComment): Promise<void>;

    /** 특정 종목 당일 코멘트 삭제(빈 코멘트 = 삭제). */
    remove(date: string, stockCode: string): Promise<void>;
}
