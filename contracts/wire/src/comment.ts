// /comment 계약 — 당일 종목 코멘트(DB curation.daily_comments). (date, code) 자연키 = 종목당 당일 1개.
// 종목의 정적 테마(정체성)는 Google Sheet(theme 계약), 여긴 "이 날, 이 종목에 남긴 메모"만.

/** POST /comment 요청 — (date, code) upsert. comment 가 빈 문자열이면 삭제. author 는 서버가 정한다. */
export interface UpsertDailyCommentInput {
    date: string;
    code: string;
    comment: string;
}

/**
 * GET /comment/all 응답의 한 행 — 클라 큐레이션 복제본(작업셋 배지·존재 지도·프리필)용 전량 피드.
 * 키(date·stockCode)를 실어야 클라가 (날짜,종목)으로 접는다. stockCode 표기는
 * 다른 전량 피드(ChartAnchor·GroupMembership)와 맞춘다.
 */
export interface DailyCommentListItem {
    date: string;
    stockCode: string;
    comment: string;
    author: string;
}
