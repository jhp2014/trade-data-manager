import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { Database } from "@trade-data-manager/data-core";

// drizzle-orm으로 직접 쿼리하기 위해 schema를 data-core에서 가져옴
// data-core의 내부 schema는 @trade-data-manager/data-core/schema로 export됨
import { dailyCandles, minuteCandles } from "@trade-data-manager/data-core/schema";

export type DailyCandleRow = typeof dailyCandles.$inferSelect;
export type MinuteCandleRow = typeof minuteCandles.$inferSelect;

export interface ChartData {
    daily: DailyCandleRow[];
    minute: MinuteCandleRow[];
}

export async function fetchChartData(
    db: Database,
    params: {
        stockCode: string;
        tradeDate: string;
        dailyLookbackDays: number;
    },
): Promise<ChartData> {
    const { stockCode, tradeDate, dailyLookbackDays } = params;

    const [dailyRows, minuteRows] = await Promise.all([
        db
            .select()
            .from(dailyCandles)
            .where(
                and(
                    eq(dailyCandles.stockCode, stockCode),
                    lte(dailyCandles.tradeDate, tradeDate),
                ),
            )
            .orderBy(desc(dailyCandles.tradeDate))
            .limit(dailyLookbackDays)
            .then((rows) => rows.slice().reverse()),
        db
            .select()
            .from(minuteCandles)
            .where(
                and(
                    eq(minuteCandles.stockCode, stockCode),
                    eq(minuteCandles.tradeDate, tradeDate),
                ),
            )
            .orderBy(asc(minuteCandles.tradeTime)),
    ]);

    return { daily: dailyRows, minute: minuteRows };
}
