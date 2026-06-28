import type { StockMaster, StockMasterRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { stockMaster } from "../schema/market.js";
import { stockMasterToRow } from "../mappers/stockMaster.js";
import { buildConflictUpdateSet } from "./_helpers.js";

// 유니버스 갱신은 name·market·listingDate 만 덮고 ipoPrice 는 보존(enrichment 가 채운 공모가 유지).
const CONFLICT_SET = buildConflictUpdateSet(stockMaster, ["stockCode", "ipoPrice"]);

/** Drizzle 구현 — stockCode PK upsert-accumulate(삭제 없음). 폐지종목 행 보존. */
export class DrizzleStockMasterRepository implements StockMasterRepository {
    constructor(private readonly db: Database) {}

    async saveStockMasters(masters: StockMaster[]): Promise<void> {
        if (masters.length === 0) return;
        await this.db
            .insert(stockMaster)
            .values(masters.map(stockMasterToRow))
            .onConflictDoUpdate({ target: stockMaster.stockCode, set: CONFLICT_SET });
    }
}
