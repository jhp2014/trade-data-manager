import { eq, inArray } from "drizzle-orm";
import { stocks, type Stock, type StockInsert } from "../schema/market";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 종목 정보를 upsert.
 */
export async function saveStock(db: Database, data: StockInsert): Promise<void> {
    await db
        .insert(stocks)
        .values(data)
        .onConflictDoUpdate({
            target: stocks.stockCode,
            set: buildConflictUpdateSet(stocks, ["stockCode"]),
        });
}

export async function findStockByCode(
    db: Database,
    params: { stockCode: string },
) {
    return db.query.stocks.findFirst({
        where: eq(stocks.stockCode, params.stockCode),
    });
}

export async function findStocksByCodes(
    db: Database,
    params: { stockCodes: string[] },
) {
    if (params.stockCodes.length === 0) return [];
    return db.select().from(stocks).where(inArray(stocks.stockCode, params.stockCodes));
}

/** Map<stockCode, Stock> 형태로 반환. 벌크 조회 결과 in-memory join 용. */
export async function findStocksMapByCodes(
    db: Database,
    params: { stockCodes: string[] },
): Promise<Map<string, Stock>> {
    const list = await findStocksByCodes(db, params);
    return new Map(list.map((s) => [s.stockCode, s]));
}
