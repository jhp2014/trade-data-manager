import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PriceLine, PriceLinedStock, PriceLineReader, PriceLineStore } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { priceLines } from "../schema/curation.js";
import { stockMaster } from "../schema/market.js";
import { priceLineToRow, rowToPriceLine } from "../mappers/priceLine.js";

/** Drizzle 구현 — surrogate id PK. 앵커 저장(가격 아님) → in-place 수정 없음(add/list/remove 만). */
export class DrizzlePriceLineRepository implements PriceLineReader, PriceLineStore {
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

    async listPriceLinedStocks(): Promise<PriceLinedStock[]> {
        // 선이 있는 (종목,날짜)로 집계 — 종목명(stock_master 조인)·선 개수. 날짜 내림차순, 같은 날 종목코드 오름차순.
        const rows = await this.db
            .select({
                stockCode: priceLines.stockCode,
                date: priceLines.tradeDate,
                name: stockMaster.name,
                lineCount: sql<number>`count(*)::int`,
            })
            .from(priceLines)
            .leftJoin(stockMaster, eq(stockMaster.stockCode, priceLines.stockCode))
            .groupBy(priceLines.stockCode, priceLines.tradeDate, stockMaster.name)
            .orderBy(desc(priceLines.tradeDate), asc(priceLines.stockCode));
        return rows.map((r) => ({ stockCode: r.stockCode, date: r.date, name: r.name ?? null, lineCount: Number(r.lineCount) }));
    }

    async remove(id: string): Promise<void> {
        await this.db.delete(priceLines).where(eq(priceLines.id, BigInt(id)));
    }
}
