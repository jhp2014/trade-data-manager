import { db, dailyCandles, dailyThemeMappings, minuteCandles, stocks, themes } from "@trade-data-manager/database";
import { eq, and, sql } from "drizzle-orm";
import type {
    DailyCandleInsert,
    MinuteCandleInsert,
    StockInsert,
} from "@/services/normalizer";

// ============================================================
// stocks
// ============================================================

/**
 * 종목 정보를 저장합니다. 이미 존재하면 갱신합니다.
 */
export async function saveStock(data: StockInsert): Promise<void> {
    await db
        .insert(stocks)
        .values(data)
        .onConflictDoUpdate({
            target: stocks.stockCode,
            set: {
                stockName: data.stockName,
                marketName: data.marketName,
                isNxtAvailable: data.isNxtAvailable,
                regDay: data.regDay,
            },
        });
}

/**
 * 종목 정보를 조회합니다.
 */
export async function findStock(
    stockCode: string
): Promise<{ regDay: string | null } | undefined> {
    return db.query.stocks.findFirst({
        where: eq(stocks.stockCode, stockCode),
        columns: { regDay: true },
    });
}

// ============================================================
// dailyCandles
// ============================================================

/**
 * 일봉 데이터를 저장합니다. 이미 존재하면 갱신합니다.
 */
export async function saveDailyCandles(rows: DailyCandleInsert[]): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(dailyCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [dailyCandles.tradeDate, dailyCandles.stockCode],
            set: {
                openKrx: sql`EXCLUDED.open_krx`,
                highKrx: sql`EXCLUDED.high_krx`,
                lowKrx: sql`EXCLUDED.low_krx`,
                closeKrx: sql`EXCLUDED.close_krx`,
                tradingVolumeKrx: sql`EXCLUDED.trading_volume_krx`,
                tradingAmountKrx: sql`EXCLUDED.trading_amount_krx`,
                openNxt: sql`EXCLUDED.open_nxt`,
                highNxt: sql`EXCLUDED.high_nxt`,
                lowNxt: sql`EXCLUDED.low_nxt`,
                closeNxt: sql`EXCLUDED.close_nxt`,
                tradingVolumeNxt: sql`EXCLUDED.trading_volume_nxt`,
                tradingAmountNxt: sql`EXCLUDED.trading_amount_nxt`,
                prevCloseKrx: sql`EXCLUDED.prev_close_krx`,
                prevCloseNxt: sql`EXCLUDED.prev_close_nxt`,
                changeValueKrx: sql`EXCLUDED.change_value_krx`,
                changeValueNxt: sql`EXCLUDED.change_value_nxt`,
            },
        });
}

/**
 * 일봉을 조회합니다. 분봉 저장 시 FK(id) 및 prevClose를 확보하는 데 사용합니다.
 */
export async function findDailyCandle(
    stockCode: string,
    tradeDate: string
): Promise<{ id: bigint; prevCloseKrx: string | null; prevCloseNxt: string | null } | undefined> {
    const row = await db.query.dailyCandles.findFirst({
        where: and(
            eq(dailyCandles.stockCode, stockCode),
            eq(dailyCandles.tradeDate, tradeDate)
        ),
        columns: { id: true, prevCloseKrx: true, prevCloseNxt: true },
    });

    if (!row) return undefined;

    return {
        id: row.id,
        prevCloseKrx: row.prevCloseKrx ?? null,
        prevCloseNxt: row.prevCloseNxt ?? null,
    };
}

// ============================================================
// minuteCandles
// ============================================================

/**
 * 분봉 데이터를 저장합니다. 이미 존재하는 시간대는 무시합니다.
 */
export async function saveMinuteCandles(rows: MinuteCandleInsert[]): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(minuteCandles)
        .values(rows)
        .onConflictDoNothing();
}

// ============================================================
// themes / dailyThemeMappings
// ============================================================

/**
 * 테마를 저장하고 ID를 반환합니다.
 */
export async function saveTheme(themeName: string): Promise<bigint> {
    const result = await db
        .insert(themes)
        .values({ themeName })
        .onConflictDoUpdate({
            target: themes.themeName,
            set: { themeName },
        })
        .returning({ id: themes.themeId });

    return result[0].id;
}

/**
 * 일봉-테마 매핑을 저장합니다. 이미 존재하면 무시합니다.
 */
export async function saveThemeMapping(
    themeId: bigint,
    dailyCandleId: bigint
): Promise<void> {
    await db
        .insert(dailyThemeMappings)
        .values({ themeId, dailyCandleId })
        .onConflictDoNothing();
}
