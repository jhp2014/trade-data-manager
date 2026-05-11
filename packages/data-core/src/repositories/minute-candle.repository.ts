import { and, asc, eq, inArray } from "drizzle-orm";
import {
    minuteCandles,
    type MinuteCandle,
    type MinuteCandleInsert,
} from "../schema/market";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 분봉 데이터를 upsert.
 */
export async function saveMinuteCandles(
    db: Database,
    rows: MinuteCandleInsert[],
): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(minuteCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [minuteCandles.stockCode, minuteCandles.tradeDate, minuteCandles.tradeTime],
            set: buildConflictUpdateSet(minuteCandles, ["id", "stockCode", "tradeDate", "tradeTime"]),
        });
}

/**
 * 해당 거래일에 분봉이 존재하는 종목코드들 (DISTINCT).
 * source of truth 가 minute_candles 이므로 이 위치가 맞음.
 */
export async function findDistinctStockCodesByDate(
    db: Database,
    params: { tradeDate: string },
) {
    const rows = await db
        .selectDistinct({ stockCode: minuteCandles.stockCode })
        .from(minuteCandles)
        .where(eq(minuteCandles.tradeDate, params.tradeDate));
    return rows.map((r) => r.stockCode);
}

/**
 * 단일 종목 + 단일 거래일의 분봉 시계열 (tradeTime ASC).
 */
export async function findMinuteCandlesByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
) {
    return db
        .select()
        .from(minuteCandles)
        .where(
            and(
                eq(minuteCandles.stockCode, params.stockCode),
                eq(minuteCandles.tradeDate, params.tradeDate),
            ),
        )
        .orderBy(asc(minuteCandles.tradeTime));
}

/**
 * 여러 종목의 단일 거래일 분봉 시계열 (stockCode → rows, tradeTime ASC).
 */
export async function findMinuteCandlesByCodesAndDate(
    db: Database,
    params: { stockCodes: string[]; tradeDate: string },
): Promise<Map<string, MinuteCandle[]>> {
    const { stockCodes, tradeDate } = params;
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select()
        .from(minuteCandles)
        .where(
            and(
                inArray(minuteCandles.stockCode, stockCodes),
                eq(minuteCandles.tradeDate, tradeDate),
            ),
        )
        .orderBy(asc(minuteCandles.stockCode), asc(minuteCandles.tradeTime));

    const map = new Map<string, MinuteCandle[]>();
    for (const r of rows) {
        const arr = map.get(r.stockCode) ?? [];
        arr.push(r);
        map.set(r.stockCode, arr);
    }
    return map;
}
