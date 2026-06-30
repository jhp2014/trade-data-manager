import type { NewsItem } from "../../../../domain/index.js";

/** 한 채널 검색 질의. channel 은 출처가 해석하는 불투명 ref(telegram: @username 또는 id 문자열). */
export interface NewsChannelSearchQuery {
    channel: string;
    /** 이 시각 이후(포함)만. 생략 = 제한 없음. */
    since?: Date;
    /** 이 시각 이전(포함)만. 생략 = 제한 없음. */
    until?: Date;
    /** 최대 건수(출처 호출 상한). 생략 = 어댑터 기본. */
    limit?: number;
}

/**
 * 뉴스 채널 검색 포트(outbound) — "한 채널 안에서 키워드 검색" 단위.
 * 여러 채널 fan-out·머지는 상위(서비스)의 책임. 이 포트는 방 1개만 안다.
 * 지금은 Telegram 어댑터만 구현. Naver 합류 시 공통점이 드러나면 그때 추상화 정리(rule of three).
 */
export interface NewsChannelSearch {
    search(query: string, opts: NewsChannelSearchQuery): Promise<NewsItem[]>;
}
