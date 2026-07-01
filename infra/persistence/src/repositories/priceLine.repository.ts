import { and, asc, eq } from "drizzle-orm";
import type { PriceLine, PriceLineRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { priceLines } from "../schema/curation.js";
import { priceLineToRow, rowToPriceLine } from "../mappers/priceLine.js";

/** Drizzle 구현 — surrogate id PK. price 가변이라 in-place update 지원. */
export class DrizzlePriceLineRepository implements PriceLineRepository {
    constructor(private readonly db: Database) {}

    async add(lines: PriceLine[]): Promise<PriceLine[]> {
        if (lines.length === 0) return [];
        const rows = await this.db.insert(priceLines).values(lines.map(priceLineToRow)).returning();
        return rows.map(rowToPriceLine);
    }

    async listByChart(stockCode: string, date: string): Promise<PriceLine[]> {
        const rows = await this.db
            .select()
            .from(priceLines)
            .where(and(eq(priceLines.stockCode, stockCode), eq(priceLines.tradeDate, date)))
            .orderBy(asc(priceLines.id));
        return rows.map(rowToPriceLine);
    }

    async update(id: string, patch: { price?: string; memo?: string | null }): Promise<void> {
        const set: { price?: number; memo?: string | null } = {};
        if (patch.price !== undefined) set.price = Number(patch.price);
        if (patch.memo !== undefined) set.memo = patch.memo;
        if (Object.keys(set).length === 0) return; // 갱신할 필드 없음
        await this.db.update(priceLines).set(set).where(eq(priceLines.id, BigInt(id)));
    }

    async remove(id: string): Promise<void> {
        await this.db.delete(priceLines).where(eq(priceLines.id, BigInt(id)));
    }
}
