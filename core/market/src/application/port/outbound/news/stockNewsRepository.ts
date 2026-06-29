import type { DateRange, NewsHeadline } from "../../../../domain/index.js";

/**
 * 뉴스 저장 포트(outbound). 한 헤드라인은 태깅 종목 수만큼 (종목, srno) 행으로 펼쳐 저장된다
 * (태그 0개면 stock_code="" 한 행). 펼침/평탄화는 어댑터(매퍼)의 관심사 — 포트는 도메인 헤드라인만 다룬다.
 */
export interface StockNewsRepository {
    /** 멱등 upsert(srno×종목 자연키). 월파티션은 들어올 달만 온디맨드 보장. */
    saveHeadlines(headlines: NewsHeadline[]): Promise<void>;

    /** 한 종목의 기간 헤드라인(시각 오름차순). stockCode="" 면 종목 미태깅(매크로) 피드. */
    getHeadlines(stockCode: string, range: DateRange): Promise<NewsHeadline[]>;
}
