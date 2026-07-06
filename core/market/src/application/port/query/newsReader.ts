import type { DateRange, NewsHeadline } from "#domain";

/**
 * 페이징 커서 — "이 지점보다 과거"의 경계. srno 는 시각 내장(YYYYMMDDHHMMSS+seq) 전역 유니크라
 * 커서로 충분하지만, 파티션(publishedDate) 정렬과 일치시키려 (날짜, srno) 복합으로 둔다.
 * 비교는 엄격히 미만: publishedDate < date, 또는 같은 날이면 srno < srno.
 */
export interface HeadlineCursor {
    publishedDate: string; // YYYY-MM-DD
    srno: string; // 19자리 무손실 문자열(저장 경계에서만 BigInt)
}

/**
 * 뉴스 조회 포트(query). stockCode="" 면 종목 미태깅(매크로) 피드.
 */
export interface StockNewsReader {
    /** 한 종목의 기간 헤드라인(시각 오름차순). */
    getHeadlines(stockCode: string, range: DateRange): Promise<NewsHeadline[]>;
    /**
     * 한 종목의 헤드라인을 최신순(내림차순)으로 최대 limit 건. before 를 주면 그 커서보다 과거만
     * (엄격히 미만) → "더 가져오기" 커서 페이징. before 생략 시 최신부터. UI 무한스크롤용.
     */
    recentHeadlines(stockCode: string, opts: { before?: HeadlineCursor; limit: number }): Promise<NewsHeadline[]>;
}
