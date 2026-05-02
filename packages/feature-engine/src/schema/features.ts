import {
    bigserial,
    bigint,
    timestamp,
    index,
    unique,
} from "drizzle-orm/pg-core";
import {
    pgTable,
    minuteCandles,
    dailyCandles,
} from "@trade-data-manager/market-data";
import { buildColumnsFromCalculators } from "../helpers";
import { MINUTE_CALCULATORS } from "../calculators/minute";

/**
 * [MinuteCandleFeatures]
 * Calculator 배열로부터 자동 생성되는 분봉 피처 테이블.
 */
export const minuteCandleFeatures = pgTable(
    "minute_candle_features",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        minuteCandleId: bigint("minute_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => minuteCandles.id, { onDelete: "cascade" }),
        dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => dailyCandles.id, { onDelete: "cascade" }),

        ...buildColumnsFromCalculators(MINUTE_CALCULATORS),

        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => {
        const t = table as any;
        return [
            unique("uq_minute_features_candle_id").on(table.minuteCandleId),
            index("idx_minute_features_date_code_time").on(
                t.tradeDate,
                t.stockCode,
                t.tradeTime
            ),
            index("idx_minute_features_pullback").on(t.pullbackFromDayHigh),
            // 동적 검색 효율을 위한 인덱스 (선택)
            index("idx_minute_features_search").on(
                t.tradeDate,
                t.cumulativeTradingAmount,
                t.closeRateNxt
            ),
        ];
    }
);

export type MinuteCandleFeatures = typeof minuteCandleFeatures.$inferSelect;
export type MinuteCandleFeaturesInsert = typeof minuteCandleFeatures.$inferInsert;
