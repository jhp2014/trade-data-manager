import { and, eq, inArray } from "drizzle-orm";
import type { DailyMarketCap, DailyMarketCapStore, DailyMarketCapReader } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyMarketCap } from "../schema/market.js";
import { marketCapToRow, rowToMarketCap } from "../mappers/marketCap.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(dailyMarketCap, ["stockCode", "tradeDate"]);

/** Drizzle 구현 — (stockCode, tradeDate) upsert. 별 테이블이라 일봉 자가치유와 독립. */
export class DrizzleDailyMarketCapRepository implements DailyMarketCapStore, DailyMarketCapReader {
    constructor(private readonly db: Database) {}

    async saveMarketCaps(rows: DailyMarketCap[]): Promise<void> {
        if (rows.length === 0) return;
        await this.db
            .insert(dailyMarketCap)
            .values(rows.map(marketCapToRow))
            .onConflictDoUpdate({
                target: [dailyMarketCap.stockCode, dailyMarketCap.tradeDate],
                set: CONFLICT_SET,
            });
    }

    async getByDateAndCodes(date: string, codes: string[]): Promise<DailyMarketCap[]> {
        if (codes.length === 0) return [];
        const rows = await this.db
            .select()
            .from(dailyMarketCap)
            .where(and(eq(dailyMarketCap.tradeDate, date), inArray(dailyMarketCap.stockCode, codes)));
        return rows.map(rowToMarketCap);
    }
}
