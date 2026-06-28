// 유니버스/종목마스터 ingest 유스케이스 구현. provider(라이브 ka10099) → repo upsert-accumulate.
import type { StockMasterProvider, StockMasterRepository } from "../port/outbound/index.js";
import type { StockMasterIngestor, StockMasterIngestResult } from "../port/inbound/index.js";

export interface StockMasterIngestDeps {
    provider: StockMasterProvider;
    repository: StockMasterRepository;
}

export class StockMasterIngestService implements StockMasterIngestor {
    constructor(private readonly deps: StockMasterIngestDeps) {}

    async ingestStockMasters(): Promise<StockMasterIngestResult> {
        const masters = await this.deps.provider.listStockMasters();
        await this.deps.repository.saveStockMasters(masters);
        // 스윕 입력은 방금 받은 fresh 코드(폐지종목 미포함) — DB 를 되읽지 않는다.
        return { saved: masters.length, stockCodes: masters.map((m) => m.stockCode) };
    }
}
