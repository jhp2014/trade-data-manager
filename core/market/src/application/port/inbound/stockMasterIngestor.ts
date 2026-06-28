// Inbound(driving) 포트 — 유니버스/종목마스터 ingest 유스케이스.
export interface StockMasterIngestResult {
    /** 적재한(=라이브 유니버스) 종목 수. */
    saved: number;
    /**
     * 라이브 유니버스 종목코드 — 전종목 일봉 스윕의 입력.
     * DB(누적 superset, 폐지종목 포함)가 아니라 이 fresh 리스트로 스윕해야 폐지종목을 헛긁지 않는다.
     */
    stockCodes: string[];
}

export interface StockMasterIngestor {
    /** 라이브 ka10099 로 유니버스를 받아 stock_master 에 upsert-accumulate 하고, 스윕용 fresh 코드 리스트를 돌려준다. */
    ingestStockMasters(): Promise<StockMasterIngestResult>;
}
