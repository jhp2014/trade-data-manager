import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import type { DailyCandle, DateRange, MarketCloses, RawDailyCandleRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyCandlesRaw } from "../schema/market.js";
import { dailyCandleToRow, rowToDailyCandle } from "../mappers/daily.js";

/**
 * Drizzle 구현 — 원주가(미수정) 일봉. daily_candles 와 컬럼 구조는 같지만(매퍼 재사용) 저장 의미가 다르다:
 * 원주가는 불변이라 **onConflictDoNothing**(재수집해도 기존 행 유지) — 수정본처럼 덮어쓰지 않는다.
 */
export class DrizzleRawDailyCandleRepository implements RawDailyCandleRepository {
    constructor(private readonly db: Database) {}

    async saveRawDailyCandles(candles: DailyCandle[]): Promise<void> {
        if (candles.length === 0) return;
        await this.db
            .insert(dailyCandlesRaw)
            .values(candles.map(dailyCandleToRow))
            .onConflictDoNothing();
    }

    async getRawDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]> {
        const rows = await this.db
            .select()
            .from(dailyCandlesRaw)
            .where(
                and(
                    eq(dailyCandlesRaw.stockCode, stockCode),
                    gte(dailyCandlesRaw.tradeDate, range.from),
                    lte(dailyCandlesRaw.tradeDate, range.to),
                ),
            )
            .orderBy(asc(dailyCandlesRaw.tradeDate));
        return rows.map(rowToDailyCandle);
    }

    async getPreviousRawClose(stockCode: string, date: string): Promise<MarketCloses | null> {
        const rows = await this.db
            .select({ closeKrx: dailyCandlesRaw.closeKrx, closeUn: dailyCandlesRaw.closeUn })
            .from(dailyCandlesRaw)
            .where(and(eq(dailyCandlesRaw.stockCode, stockCode), lt(dailyCandlesRaw.tradeDate, date)))
            .orderBy(desc(dailyCandlesRaw.tradeDate))
            .limit(1);
        return rows[0] ? { krxClose: String(rows[0].closeKrx), unClose: String(rows[0].closeUn) } : null;
    }

    async getEarliestRawDailyDate(stockCode: string): Promise<string | null> {
        const rows = await this.db
            .select({ tradeDate: dailyCandlesRaw.tradeDate })
            .from(dailyCandlesRaw)
            .where(eq(dailyCandlesRaw.stockCode, stockCode))
            .orderBy(asc(dailyCandlesRaw.tradeDate))
            .limit(1);
        return rows[0]?.tradeDate ?? null;
    }
}
