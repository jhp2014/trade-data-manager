import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { MinuteCandle, MinuteCandleStore, MinuteReader, MinuteDateReader } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { minuteCandles } from "../schema/market.js";
import { minuteCandleToRow, rowToMinuteCandle } from "../mappers/minute.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(minuteCandles, [
    "tradeDate",
    "stockCode",
    "tradeTime",
]);

/** Drizzle 구현 — (tradeDate, stockCode, tradeTime) 자연키 upsert + (종목,날) 시계열 조회 + 전역 거래일 열거. */
export class DrizzleMinuteCandleRepository implements MinuteCandleStore, MinuteReader, MinuteDateReader {
    constructor(private readonly db: Database) {}

    async saveMinuteCandles(candles: MinuteCandle[]): Promise<void> {
        if (candles.length === 0) return;
        // 분봉은 trade_date 월별 RANGE 파티션 → 들어올 달의 파티션을 INSERT 전에 보장(멱등).
        const months = new Set(candles.map((c) => `${c.date.slice(0, 7)}-01`));
        for (const month of months) {
            await this.db.execute(sql`SELECT "market".ensure_minute_partition(${month}::date)`);
        }
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

    async deleteMinuteCandlesOnDate(date: string): Promise<number> {
        const res = await this.db.delete(minuteCandles).where(eq(minuteCandles.tradeDate, date));
        return res.rowCount ?? 0;
    }

    // --- MinuteDateReader (data-aware 날짜피커: 전역 distinct 거래일) ---
    // after 지정 시 `trade_date > after` — 월별 RANGE 파티션 프루닝으로 최신 파티션만 스캔(저렴한 꼬리 갱신).
    async listMinuteDates(after?: string): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ tradeDate: minuteCandles.tradeDate })
            .from(minuteCandles)
            .where(after !== undefined ? gt(minuteCandles.tradeDate, after) : undefined)
            .orderBy(asc(minuteCandles.tradeDate));
        return rows.map((r) => r.tradeDate);
    }
}
