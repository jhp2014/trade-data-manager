import { and, eq, asc, sql, getTableColumns } from "drizzle-orm";
import {
    minuteCandles,
    type MinuteCandle,
} from "@trade-data-manager/market-data";
import { minuteCandleFeatures } from "@trade-data-manager/feature-engine";
import { db } from "./db";

/**
 * 특정 날짜에 분봉이 존재하는 종목 코드 목록.
 */
export async function getStockCodesForDate(
    tradeDate: string
): Promise<string[]> {
    const rows = await db
        .selectDistinct({ stockCode: minuteCandles.stockCode })
        .from(minuteCandles)
        .where(eq(minuteCandles.tradeDate, tradeDate));
    return rows.map((r) => r.stockCode);
}

/**
 * 한 종목의 하루치 분봉 (시간 ASC).
 */
export async function getMinuteCandlesForDay(
    stockCode: string,
    tradeDate: string
): Promise<MinuteCandle[]> {
    return db
        .select()
        .from(minuteCandles)
        .where(
            and(
                eq(minuteCandles.stockCode, stockCode),
                eq(minuteCandles.tradeDate, tradeDate)
            )
        )
        .orderBy(asc(minuteCandles.tradeTime));
}

/**
 * 분봉 피처 배치 INSERT (UPSERT).
 */
export async function saveMinuteFeatures(
    rows: Array<Record<string, any>>
): Promise<void> {
    if (rows.length === 0) return;

    const updateSet = buildMinuteFeaturesUpdateSet();

    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        await db
            .insert(minuteCandleFeatures)
            .values(chunk as any)
            .onConflictDoUpdate({
                target: minuteCandleFeatures.minuteCandleId,
                set: updateSet,
            });
    }
}

function buildMinuteFeaturesUpdateSet() {
    const columns = getTableColumns(minuteCandleFeatures);
    const excluded = new Set([
        "id",
        "minuteCandleId",
        "dailyCandleId",
        "createdAt",
    ]);
    const set: Record<string, any> = {};
    for (const [tsKey, col] of Object.entries(columns)) {
        if (excluded.has(tsKey)) continue;
        set[tsKey] = sql.raw(`excluded.${col.name}`);
    }
    set.updatedAt = sql`now()`;
    return set;
}

/**
 * 분봉 데이터가 존재하는 모든 거래일.
 */
export async function getAllTradeDates(): Promise<string[]> {
    const rows = await db
        .selectDistinct({ tradeDate: minuteCandles.tradeDate })
        .from(minuteCandles)
        .orderBy(asc(minuteCandles.tradeDate));
    return rows.map((r) => r.tradeDate);
}

/**
 * 아직 minute_candle_features에 가공되지 않은 거래일.
 */
export async function getPendingTradeDates(): Promise<string[]> {
    const result = await db.execute(sql`
        SELECT DISTINCT mc.trade_date
        FROM minute_candles mc
        LEFT JOIN minute_candle_features mcf
          ON mcf.minute_candle_id = mc.id
        WHERE mcf.id IS NULL
        ORDER BY mc.trade_date ASC
    `);
    return (result.rows as Array<{ trade_date: string }>).map(
        (r) => r.trade_date
    );
}
