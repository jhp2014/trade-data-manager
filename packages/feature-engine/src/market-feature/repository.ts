import { and, eq, asc, sql, getTableColumns } from "drizzle-orm";
import { minuteCandles, type MinuteCandle } from "@trade-data-manager/market-data";
import { minuteCandleFeatures } from "./schema";
import type { Database } from "../index";

export async function getStockCodesForDate(
    db: Database,
    tradeDate: string
): Promise<string[]> {
    const rows = await db
        .selectDistinct({ stockCode: minuteCandles.stockCode })
        .from(minuteCandles)
        .where(eq(minuteCandles.tradeDate, tradeDate));
    return rows.map((r) => r.stockCode);
}

export async function getMinuteCandlesForDay(
    db: Database,
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

export async function saveMinuteFeatures(
    db: Database,
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
    const excluded = new Set(["id", "minuteCandleId", "dailyCandleId", "createdAt"]);
    const set: Record<string, any> = {};
    for (const [tsKey, col] of Object.entries(columns)) {
        if (excluded.has(tsKey)) continue;
        set[tsKey] = sql.raw(`excluded.${col.name}`);
    }
    set.updatedAt = sql`now()`;
    return set;
}

export async function getAllTradeDates(db: Database): Promise<string[]> {
    const rows = await db
        .selectDistinct({ tradeDate: minuteCandles.tradeDate })
        .from(minuteCandles)
        .orderBy(asc(minuteCandles.tradeDate));
    return rows.map((r) => r.tradeDate);
}

export async function getPendingTradeDates(db: Database): Promise<string[]> {
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
