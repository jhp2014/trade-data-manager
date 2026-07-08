// /comment 계약 — 당일 종목 코멘트(DB curation.daily_comments). (date, code) 자연키 = 종목당 당일 1개.
// 종목의 정적 테마(정체성)는 Google Sheet(theme 계약), 여긴 "이 날, 이 종목에 남긴 메모"만.

/** GET /comment?date=&code= 응답 — 그 (날짜,종목)의 코멘트. 없으면 null. author 는 서버(env)가 채운다. */
export interface DailyCommentDto {
    comment: string;
    author: string;
}

/** POST /comment 요청 — (date, code) upsert. comment 가 빈 문자열이면 삭제. author 는 서버가 정한다. */
export interface UpsertDailyCommentInput {
    date: string;
    code: string;
    comment: string;
}
