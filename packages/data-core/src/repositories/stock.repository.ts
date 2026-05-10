import { eq, inArray } from "drizzle-orm";
import { stocks, type Stock, type StockInsert } from "../schema/market";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 종목 정보를 저장합니다. 이미 존재하면 갱신합니다.
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
): Promise<Stock | null> {
    const row = await db.query.stocks.findFirst({
        where: eq(stocks.stockCode, params.stockCode),
    });
    return row ?? null;
}

export async function findStocksByCodes(
    db: Database,
    params: { stockCodes: string[] },
): Promise<Stock[]> {
    if (params.stockCodes.length === 0) return [];
    return db.select().from(stocks).where(inArray(stocks.stockCode, params.stockCodes));
}

/** Map<stockCode, Stock> 형태로 반환. 조회 결과 없는 코드는 키 없음. */
export async function findStocksMapByCodes(
    db: Database,
    params: { stockCodes: string[] },
): Promise<Map<string, Stock>> {
    const list = await findStocksByCodes(db, params);
    return new Map(list.map((s) => [s.stockCode, s]));
}

/**
 * 종목의 상장일을 API 포맷('YYYYMMDD')으로 조회합니다.
 *  - 매핑된 row 가 없거나 regDay 가 null 이면 null 반환
 */
export async function findStockRegDayApiFormat(
    db: Database,
    params: { stockCode: string },
): Promise<string | null> {
    const row = await db.query.stocks.findFirst({
        columns: { regDay: true },
        where: eq(stocks.stockCode, params.stockCode),
    });
    return row?.regDay?.replace(/-/g, "") ?? null;
}
