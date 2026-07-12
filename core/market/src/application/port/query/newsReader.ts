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
 * 최신순 피드 조회 옵션 — 종목/전체 × 키워드 × 커서를 한 모양으로.
 * before(커서 페이징)와 onOrBefore(초기 앵커)는 배타 — before 가 있으면 onOrBefore 는 무시.
 */
export interface HeadlineFeedOptions {
    /** 지정 = 그 종목 태깅 행만("" = 미태깅 매크로). 생략 = 전체 시황(모든 행, srno 단위 dedup). */
    stockCode?: string;
    /** 제목 부분일치(대소문자 무시). */
    titleKeyword?: string;
    /** 이 커서보다 엄격히 과거만 — "더 가져오기" 페이징. */
    before?: HeadlineCursor;
    /** publishedDate ≤ 이 날짜 — 복기 초기 로드 앵커(그 날짜 이하 최신부터). */
    onOrBefore?: string;
    limit: number;
}

/**
 * 뉴스 조회 포트(query). stockCode="" 면 종목 미태깅(매크로) 피드.
 */
export interface StockNewsReader {
    /** 한 종목의 기간 헤드라인(시각 오름차순). */
    getHeadlines(stockCode: string, range: DateRange): Promise<NewsHeadline[]>;
    /**
     * 헤드라인 최신순(내림차순) 피드 — 최대 limit 건. 종목 생략 시 전체 시황(한 헤드라인이 여러
     * 종목에 태깅돼도 한 번만). UI 무한스크롤용.
     */
    feedHeadlines(opts: HeadlineFeedOptions): Promise<NewsHeadline[]>;
}
