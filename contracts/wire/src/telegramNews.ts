// /news/telegram 계약 — 등록 방 키워드 검색 결과(하루 단위). HTS 와 별개 소스(본문 전문 + 방 + 링크).
export interface TelegramNewsItem {
    channel: string; // 방 표시명
    at: string; // ISO 절대시각(표시계층에서 KST 포맷)
    text: string; // 본문 전문
    url?: string; // 대표 링크(있으면)
    ref: string; // `${peer}#${messageId}` — 고유 식별
}

/** 봉투 — items + 이 페이지가 걸어간 가장 과거 날짜(다음 더보기 커서). 빈 날은 클라가 모르므로 서버가 알려줌. */
export interface TelegramNewsPage {
    items: TelegramNewsItem[];
    oldestDate: string;
}
