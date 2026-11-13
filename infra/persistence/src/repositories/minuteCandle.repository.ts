import { and, asc, eq, gt, sql } from "drizzle-orm";
import type {
    DateRange,
    MinuteCandle,
    MinuteCandleStore,
    MinuteDateReader,
    MinuteReader,
    MinuteRepairStore,
    MinuteStockDay,
} from "@trade-data-manager/market";
import type { Database, DbClient } from "../db.js";
import { minuteCandles } from "../schema/market.js";
import { minuteCandleToRow, rowToMinuteCandle } from "../mappers/minute.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(minuteCandles, [
    "tradeDate",
    "stockCode",
    "tradeTime",
]);

/** Drizzle 구현 — (tradeDate, stockCode, tradeTime) 자연키 upsert + (종목,날) 시계열 조회 + 전역 거래일 열거 + 옛 분봉 수리. */
export class DrizzleMinuteCandleRepository implements MinuteCandleStore, MinuteReader, MinuteDateReader, MinuteRepairStore {
    constructor(private readonly db: Database) {}

    async saveMinuteCandles(candles: MinuteCandle[]): Promise<void> {
        await upsertMinuteCandles(this.db, candles);
    }

    // --- MinuteRepairStore (옛 분봉 수리 — decisions 「옛 분봉 — 토스 바탕 + 대신 수리」) ---

    async listKrxlessMinuteDays(range: DateRange): Promise<MinuteStockDay[]> {
        // KRX 칸은 봉 단위로 함께 차거나 빈다 — 거래량 칸 하나로 본다.
        const res = await this.db.execute<{ stock_code: string; trade_date: string }>(sql`
            SELECT m."stock_code", to_char(m."trade_date", 'YYYY-MM-DD') AS "trade_date"
              FROM "market"."minute_candles" m
             WHERE m."trade_date" BETWEEN ${range.from} AND ${range.to}
             GROUP BY m."stock_code", m."trade_date"
            HAVING bool_and(m."volume_krx" IS NULL)
             ORDER BY m."trade_date", m."stock_code"
        `);
        return res.rows.map((r) => ({ stockCode: r.stock_code, date: r.trade_date }));
    }

    async replaceMinuteCandlesOfDay(stockCode: string, date: string, candles: MinuteCandle[]): Promise<void> {
        if (candles.length === 0) throw new Error(`${stockCode} ${date}: 빈 분봉으로 교체하지 않는다`);
        const stray = candles.find((c) => c.stockCode !== stockCode || c.date !== date);
        if (stray) throw new Error(`${stockCode} ${date}: 다른 종목-날 봉이 섞였다 (${stray.stockCode} ${stray.date})`);
        await this.db.transaction(async (tx) => {
            await tx
                .delete(minuteCandles)
                .where(and(eq(minuteCandles.stockCode, stockCode), eq(minuteCandles.tradeDate, date)));
            await upsertMinuteCandles(tx, candles);
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

    async getMinuteStockCodesOnDate(date: string): Promise<string[]> {
        // 그 날짜 파티션의 distinct 종목코드 — 재개 diff(기대집합 − 저장집합)의 저장집합.
        const rows = await this.db
            .selectDistinct({ stockCode: minuteCandles.stockCode })
            .from(minuteCandles)
            .where(eq(minuteCandles.tradeDate, date));
        return rows.map((r) => r.stockCode);
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

/** 자연키 upsert. 분봉은 trade_date 월별 RANGE 파티션 → 들어올 달의 파티션을 INSERT 전에 보장(멱등). */
async function upsertMinuteCandles(db: DbClient, candles: MinuteCandle[]): Promise<void> {
    if (candles.length === 0) return;
    const months = new Set(candles.map((c) => `${c.date.slice(0, 7)}-01`));
    for (const month of months) {
        await db.execute(sql`SELECT "market".ensure_minute_partition(${month}::date)`);
    }
    await db
        .insert(minuteCandles)
        .values(candles.map(minuteCandleToRow))
        .onConflictDoUpdate({
            target: [minuteCandles.tradeDate, minuteCandles.stockCode, minuteCandles.tradeTime],
            set: CONFLICT_SET,
        });
}
