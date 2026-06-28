import { and, asc, eq } from "drizzle-orm";
import type { MinuteCandle, MinuteCandleRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { minuteCandles } from "../schema/market.js";
import { minuteCandleToRow, rowToMinuteCandle } from "../mappers/minute.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(minuteCandles, [
    "tradeDate",
    "stockCode",
    "tradeTime",
]);

/** Drizzle 구현 — (tradeDate, stockCode, tradeTime) 자연키 upsert + (종목,날) 시계열 조회. */
export class DrizzleMinuteCandleRepository implements MinuteCandleRepository {
    constructor(private readonly db: Database) {}

    async saveMinuteCandles(candles: MinuteCandle[]): Promise<void> {
        if (candles.length === 0) return;
        await this.db
            .insert(minuteCandles)
            .values(candles.map(minuteCandleToRow))
            .onConflictDoUpdate({
                target: [minuteCandles.tradeDate, minuteCandles.stockCode, minuteCandles.tradeTime],
                set: CONFLICT_SET,
            });
    }

    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        const rows = await this.db
            .select()
            .from(minuteCandles)
            .where(and(eq(minuteCandles.stockCode, stockCode), eq(minuteCandles.tradeDate, date)))
            .orderBy(asc(minuteCandles.tradeTime));
        return rows.map(rowToMinuteCandle);
    }

    async hasMinuteCandlesOnDate(date: string): Promise<boolean> {
        const rows = await this.db
            .select({ tradeDate: minuteCandles.tradeDate })
            .from(minuteCandles)
            .where(eq(minuteCandles.tradeDate, date))
            .limit(1);
        return rows.length > 0;
    }
}
