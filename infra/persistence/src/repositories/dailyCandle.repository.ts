import { and, asc, eq, gte, lte } from "drizzle-orm";
import type {
    DailyCandle,
    DailyCandleRepository,
    DateRange,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyCandles } from "../schema/market.js";
import { dailyCandleToRow, rowToDailyCandle } from "../mappers/daily.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(dailyCandles, ["tradeDate", "stockCode"]);

/** Drizzle 구현 — (tradeDate, stockCode) 자연키 upsert + 범위/단건 조회. */
export class DrizzleDailyCandleRepository implements DailyCandleRepository {
    constructor(private readonly db: Database) {}

    async saveDailyCandles(candles: DailyCandle[]): Promise<void> {
        if (candles.length === 0) return;
        await this.db
            .insert(dailyCandles)
            .values(candles.map(dailyCandleToRow))
            .onConflictDoUpdate({
                target: [dailyCandles.tradeDate, dailyCandles.stockCode],
                set: CONFLICT_SET,
            });
    }

    async getDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]> {
        const rows = await this.db
            .select()
            .from(dailyCandles)
            .where(
                and(
                    eq(dailyCandles.stockCode, stockCode),
                    gte(dailyCandles.tradeDate, range.from),
                    lte(dailyCandles.tradeDate, range.to),
                ),
            )
            .orderBy(asc(dailyCandles.tradeDate));
        return rows.map(rowToDailyCandle);
    }

    async getDailyCandle(stockCode: string, date: string): Promise<DailyCandle | null> {
        const rows = await this.db
            .select()
            .from(dailyCandles)
            .where(and(eq(dailyCandles.stockCode, stockCode), eq(dailyCandles.tradeDate, date)))
            .limit(1);
        return rows[0] ? rowToDailyCandle(rows[0]) : null;
    }

    async getEarliestDailyDate(stockCode: string): Promise<string | null> {
        const rows = await this.db
            .select({ tradeDate: dailyCandles.tradeDate })
            .from(dailyCandles)
            .where(eq(dailyCandles.stockCode, stockCode))
            .orderBy(asc(dailyCandles.tradeDate))
            .limit(1);
        return rows[0]?.tradeDate ?? null;
    }
}
