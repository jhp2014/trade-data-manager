import { and, desc, eq, lte } from "drizzle-orm";
import {
    dailyCandles,
    type DailyCandle,
    type DailyCandleInsert,
} from "../schema/market";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 일봉 데이터를 upsert.
 */
export async function saveDailyCandles(
    db: Database,
    rows: DailyCandleInsert[],
): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(dailyCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [dailyCandles.tradeDate, dailyCandles.stockCode],
            set: buildConflictUpdateSet(dailyCandles, ["id", "tradeDate", "stockCode"]),
        });
}

/**
 * 종목+거래일의 일봉 1건. FK(id) 및 prevClose 등 후처리용으로 사용.
 */
export async function findDailyCandleByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
) {
    return db.query.dailyCandles.findFirst({
        where: and(
            eq(dailyCandles.stockCode, params.stockCode),
            eq(dailyCandles.tradeDate, params.tradeDate),
        ),
        columns: { id: true, prevCloseKrx: true, prevCloseNxt: true },
    });
}

/**
 * 종목들의 tradeDate 이전 N개 일봉을 가져온다 (각 종목당 ASC 정렬).
 *  - 종목별 LIMIT N 패턴이라 SQL 단일쿼리로 깔끔하지 않아 개별 쿼리 + Promise.all 사용.
 */
export async function findRecentDailyCandlesByCodes(
    db: Database,
    params: { stockCodes: string[]; tradeDate: string; lookback: number },
): Promise<Map<string, DailyCandle[]>> {
    const { stockCodes, tradeDate, lookback } = params;
    if (stockCodes.length === 0) return new Map();

    const lists = await Promise.all(
        stockCodes.map(async (code) => {
            const rows = await db
                .select()
                .from(dailyCandles)
                .where(
                    and(
                        eq(dailyCandles.stockCode, code),
                        lte(dailyCandles.tradeDate, tradeDate),
                    ),
                )
                .orderBy(desc(dailyCandles.tradeDate))
                .limit(lookback);
            return [code, rows.slice().reverse()] as const;
        }),
    );

    return new Map(lists);
}
