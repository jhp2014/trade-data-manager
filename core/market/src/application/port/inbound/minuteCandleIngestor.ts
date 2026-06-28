// Inbound(driving) 포트 — 분봉 ingest 유스케이스. (종목, 거래일) 단위 적재.
export interface MinuteIngestResult {
    stockCode: string;
    date: string;
    /** 저장한 분봉 수. */
    saved: number;
}

/**
 * 분봉 수집 유스케이스. provider(단일/라우팅)가 준 정직한 봉만 그대로 적재한다
 * (빈 분 채움 densify 는 읽는 소비자 책임). 자가치유 없음 — (종목,날) 자연키 upsert.
 */
export interface MinuteCandleIngestor {
    ingestMinuteCandles(stockCode: string, date: string): Promise<MinuteIngestResult>;
}
