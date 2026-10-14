// /news/telegram 계약 — 등록 방 키워드 검색 결과(하루 단위). HTS 와 별개 소스(본문 전문 + 방 + 링크).
export interface TelegramNewsItem {
    channel: string; // 방 표시명
    at: string; // ISO 절대시각(표시계층에서 KST 포맷)
    text: string; // 본문 전문
    url?: string; // 대표 링크(있으면)
    ref: string; // `${peer}#${messageId}` — 고유 식별
    /** 본문 글자 뒤 숨은 링크(TextUrl). offset/length 는 text 의 UTF-16 인덱스. text 가 원문 본문일 때만. */
    links?: Array<{ offset: number; length: number; url: string }>;
    /** 링크 미리보기 글(제목·설명) — 검색은 본문+미리보기를 보므로 본문에 없는 낱말로 걸린 항목의 근거. 없으면 칸 없음. */
    preview?: { title?: string; description?: string };
}

/**
 * /news/telegram/archive 봉투 — DB 아카이브만(라이브 폴백 없음). coverage = DB 가 통째로 든 구간(null = sync 완주 전):
 * 빈 items 가 "언급 없음"인지 "아직 수집 안 됨"인지 가르는 재료. nextBefore 는 limit 에 걸렸을 때만(다음 요청의 before=).
 */
export interface TelegramArchivePage {
    items: TelegramNewsItem[];
    coverage: { from: string; to: string } | null;
    nextBefore?: string;
}

/** 봉투 — items + 이 페이지가 걸어간 가장 과거 날짜(다음 더보기 커서). 빈 날은 클라가 모르므로 서버가 알려줌. */
export interface TelegramNewsPage {
    items: TelegramNewsItem[];
    oldestDate: string;
}
