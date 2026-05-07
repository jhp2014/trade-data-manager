import { and, asc, eq } from "drizzle-orm";
import { minuteCandles, type MinuteCandle, type MinuteCandleInsert } from "../schema/market";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 분봉 데이터를 저장합니다. 이미 존재하면 갱신합니다.
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
 * 특정 거래일에 분봉이 기록된 종목 코드 목록 (DISTINCT).
 */
export async function findDistinctStockCodesByDate(
    db: Database,
    params: { tradeDate: string },
): Promise<string[]> {
    const rows = await db
        .selectDistinct({ stockCode: minuteCandles.stockCode })
        .from(minuteCandles)
        .where(eq(minuteCandles.tradeDate, params.tradeDate));
    return rows.map((r) => r.stockCode);
}

/**
 * 특정 종목 + 거래일의 분봉을 시간 ASC 로 반환.
 */
export async function findMinuteCandlesByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
): Promise<MinuteCandle[]> {
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
