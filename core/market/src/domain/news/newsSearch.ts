// core/market/domain — 소스 무관 "뉴스 검색 결과 한 건"(NewsItem).
// KIS 시황 헤드라인([[NewsHeadline]], 저장·월파티션용)과 달리, 이건 여러 출처(Telegram·향후 KIS·Naver)를
// 키워드로 검색해 합쳐 보여주기 위한 통일 출력 타입이다. 검색 "방식"(입력)은 출처마다 다르므로 포트는
// 출처별로 따로 두되, "결과"(출력)만 여기서 하나로 모은다 → 머지·정렬·표시가 출처에 독립적이 된다.

/** 뉴스 출처 종류. 현재 telegram 만, kis/naver 는 합류 예정. */
export type NewsSourceKind = "telegram" | "kis" | "naver";

/**
 * 검색으로 찾은 뉴스 한 건. 저장이 아니라 라이브 검색 표시용(휘발).
 * at 은 작성 시각(절대시간) — 출처 합쳐 최신순 정렬의 키.
 */
export interface NewsItem {
    source: NewsSourceKind;
    /** 출처 내 채널/방의 표시명(예: "주식 급등일보"). */
    channel: string;
    /** 작성 시각(절대시간, UTC instant). 표시계층에서 Asia/Seoul 로 포맷. */
    at: Date;
    /** 본문/헤드라인 텍스트. */
    text: string;
    /** 본문에서 추출한 대표 링크(있으면). */
    url?: string;
    /** 출처 고유 식별 — dedup·원문추적용. telegram: `${peer}#${messageId}`. */
    ref: string;
}
