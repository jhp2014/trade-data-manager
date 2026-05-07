import {
    bigserial,
    bigint,
    timestamp,
    index,
    unique,
    date,
    varchar,
    time,
} from "drizzle-orm/pg-core";
import {
    pgTable,
    minuteCandles,
    dailyCandles,
} from "./market";
import { buildColumnsFromCalculators } from "../market-feature/helpers";
import { MINUTE_CALCULATORS } from "../market-feature/calculators";

/**
 * [MinuteCandleFeatures]
 * Calculator 배열로부터 자동 생성되는 분봉 피처 테이블.
 *
 * tradeDate / stockCode / tradeTime 은 "어느 분봉의 피처인지"를 식별하는
 * 메타(키성) 컬럼이므로 calculator 결과가 아니라 schema 에 명시적으로 둔다.
 * runner 에서 minuteCandleId, dailyCandleId 와 함께 직접 채워준다.
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

        // 식별용 메타 컬럼 (비정규화) — calculator 가 아닌 runner 가 채움
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeTime: time("trade_time").notNull(),

        // calculator 가 출력하는 피처 컬럼들
        ...buildColumnsFromCalculators(MINUTE_CALCULATORS),

        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => {
        const t = table as any;
        return [
            unique("uq_minute_features_candle_id").on(table.minuteCandleId),
            index("idx_minute_features_date_code_time").on(
                table.tradeDate,
                table.stockCode,
                table.tradeTime,
            ),
            index("idx_minute_features_pullback").on(t.pullbackFromDayHigh),
            index("idx_minute_features_search").on(
                table.tradeDate,
                t.cumulativeTradingAmount,
                t.closeRateNxt,
            ),
        ];
    }
);

export type MinuteCandleFeatures = typeof minuteCandleFeatures.$inferSelect;
export type MinuteCandleFeaturesInsert = typeof minuteCandleFeatures.$inferInsert;
