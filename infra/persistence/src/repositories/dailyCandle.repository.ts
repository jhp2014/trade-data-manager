import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type {
    DailyCandle,
    DailyCandleStore,
    AdjustedDailyReader,
    DailyCandleSnapshotReader,
    DailyScanRepository,
    DataDateReader,
    DateRange,
    PreviousClose,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyCandles } from "../schema/market.js";
import { dailyCandleToRow, rowToDailyCandle } from "../mappers/daily.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(dailyCandles, ["tradeDate", "stockCode"]);

/** Drizzle 구현 — 종목별 store/read(DailyCandleStore·AdjustedDailyReader) + 스냅샷 read + 날짜별 스캔. 같은 daily_candles. */
export class DrizzleDailyCandleRepository
    implements DailyCandleStore, AdjustedDailyReader, DailyCandleSnapshotReader, DailyScanRepository, DataDateReader
{
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

    async getByDateAndCodes(date: string, codes: string[]): Promise<DailyCandle[]> {
        if (codes.length === 0) return [];
        const rows = await this.db
            .select()
            .from(dailyCandles)
            .where(and(eq(dailyCandles.tradeDate, date), inArray(dailyCandles.stockCode, codes)));
        return rows.map(rowToDailyCandle);
    }

    async getPreviousCloses(date: string, codes: string[]): Promise<PreviousClose[]> {
        if (codes.length === 0) return [];
        // 코드별 date 이전 최신 캔들 1행(DISTINCT ON) → 시장별 close. 종목마다 직전 거래일이 다를 수 있어
        // (거래정지 등) 시장 전체 전일이 아니라 각 종목의 직전 캔들에서 뽑는다.
        const rows = await this.db
            .selectDistinctOn([dailyCandles.stockCode], {
                stockCode: dailyCandles.stockCode,
                closeKrx: dailyCandles.closeKrx,
                closeUn: dailyCandles.closeUn,
            })
            .from(dailyCandles)
            .where(and(lt(dailyCandles.tradeDate, date), inArray(dailyCandles.stockCode, codes)))
            .orderBy(dailyCandles.stockCode, desc(dailyCandles.tradeDate));
        return rows.map((r) => ({
            stockCode: r.stockCode,
            krxClose: String(r.closeKrx),
            unClose: String(r.closeUn),
        }));
    }

    // --- DailyScanRepository (날짜별 전종목 스캔) ---

    async listDailyCandlesByDate(date: string): Promise<DailyCandle[]> {
        const rows = await this.db
            .select()
            .from(dailyCandles)
            .where(eq(dailyCandles.tradeDate, date));
        return rows.map(rowToDailyCandle);
    }

    async getPreviousTradingDate(date: string): Promise<string | null> {
        const rows = await this.db
            .select({ tradeDate: dailyCandles.tradeDate })
            .from(dailyCandles)
            .where(lt(dailyCandles.tradeDate, date))
            .orderBy(desc(dailyCandles.tradeDate))
            .limit(1);
        return rows[0]?.tradeDate ?? null;
    }

    async getLatestDailyDate(): Promise<string | null> {
        const rows = await this.db
            .select({ tradeDate: dailyCandles.tradeDate })
            .from(dailyCandles)
            .orderBy(desc(dailyCandles.tradeDate))
            .limit(1);
        return rows[0]?.tradeDate ?? null;
    }

    async listTradedStockCodes(range: DateRange): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ stockCode: dailyCandles.stockCode })
            .from(dailyCandles)
            .where(and(gte(dailyCandles.tradeDate, range.from), lte(dailyCandles.tradeDate, range.to)))
            .orderBy(asc(dailyCandles.stockCode));
        return rows.map((r) => r.stockCode);
    }

    async listTradedDates(range: DateRange): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ tradeDate: dailyCandles.tradeDate })
            .from(dailyCandles)
            .where(and(gte(dailyCandles.tradeDate, range.from), lte(dailyCandles.tradeDate, range.to)))
            .orderBy(asc(dailyCandles.tradeDate));
        return rows.map((r) => r.tradeDate);
    }

    // --- DataDateReader (data-aware 날짜피커: 전역 distinct 거래일) ---

    async listDataDates(): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ tradeDate: dailyCandles.tradeDate })
            .from(dailyCandles)
            .orderBy(asc(dailyCandles.tradeDate));
        return rows.map((r) => r.tradeDate);
    }
}
