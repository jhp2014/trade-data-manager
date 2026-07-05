import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { StockMaster, StockMasterRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { stockMaster } from "../schema/market.js";
import { stockMasterToRow, rowToStockMaster } from "../mappers/stockMaster.js";
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

    async updateIpoPrice(stockCode: string, ipoPrice: string): Promise<void> {
        // 공모가만 갱신(integer 컬럼). 도메인 무손실 string → 경계에서 Number.
        await this.db
            .update(stockMaster)
            .set({ ipoPrice: Number(ipoPrice) })
            .where(eq(stockMaster.stockCode, stockCode));
    }

    async getByStockCodes(codes: string[]): Promise<StockMaster[]> {
        if (codes.length === 0) return [];
        const rows = await this.db
            .select()
            .from(stockMaster)
            .where(inArray(stockMaster.stockCode, codes));
        return rows.map(rowToStockMaster);
    }

    async listNeedingIpoPrice(listedSince: string): Promise<{ stockCode: string; listingDate: string }[]> {
        const rows = await this.db
            .select({ stockCode: stockMaster.stockCode, listingDate: stockMaster.listingDate })
            .from(stockMaster)
            .where(and(isNull(stockMaster.ipoPrice), gte(stockMaster.listingDate, listedSince)))
            .orderBy(asc(stockMaster.listingDate));
        return rows
            .filter((r): r is { stockCode: string; listingDate: string } => r.listingDate !== null)
            .map((r) => ({ stockCode: r.stockCode, listingDate: r.listingDate }));
    }
}
