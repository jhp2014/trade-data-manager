// 유니버스/종목마스터 ingest 유스케이스 구현. provider(라이브 ka10099) → repo upsert-accumulate.
import type { StockMasterProvider, StockMasterRepository } from "../port/outbound/index.js";

// 내부 협력자. inbound 포트 아님.
export interface StockMasterIngestResult {
    saved: number;
    /** 라이브 유니버스 종목코드 — 일봉 스윕 입력(폐지종목 미포함, DB 안 되읽음). */
    stockCodes: string[];
}

export interface StockMasterIngestDeps {
    provider: StockMasterProvider;
    repository: StockMasterRepository;
}

export class StockMasterIngestService {
    constructor(private readonly deps: StockMasterIngestDeps) {}

    async ingestStockMasters(): Promise<StockMasterIngestResult> {
        const masters = await this.deps.provider.listStockMasters();
        await this.deps.repository.saveStockMasters(masters);
        // 스윕 입력은 방금 받은 fresh 코드(폐지종목 미포함) — DB 를 되읽지 않는다.
        return { saved: masters.length, stockCodes: masters.map((m) => m.stockCode) };
    }
}
