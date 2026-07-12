import type { NewsItem } from "#domain";

export interface NewsSearchOptions {
    /** 이 시각 이후(포함)만. */
    since?: Date;
    /** 이 시각 이전(포함)만. */
    until?: Date;
    /** 방 1개당 최대 건수. */
    limitPerChannel?: number;
}

/**
 * 뉴스 검색(읽기 Query) — 키워드 하나를 등록된 방 전체에 동시검색해 최신순으로 합쳐 돌려준다.
 * query 가 빈 문자열이면 검색 없이 최근 메시지 피드(방 전체 merge) — "전체 최근" 모드.
 * 백필(NewsBackfiller)이 과거를 DB에 적재하는 쓰기라면, 이건 저장 없이 라이브로 훑는 읽기다.
 */
export interface NewsSearcher {
    search(query: string, opts?: NewsSearchOptions): Promise<NewsItem[]>;
}
