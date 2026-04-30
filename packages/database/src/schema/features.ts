import { pgTable } from "./market"
import {
    bigserial,
    bigint,
    varchar,
    numeric,
    date,
    time,
    integer,
    timestamp,
    index,
    unique,
} from "drizzle-orm/pg-core";
import { dailyCandles, minuteCandles, stocks, themes } from "./market";
import { commonCandleFeatureCols, commonThemeStatsCols, generateDynamicSlots, pivotHighFeatureCols, simpleMaxPriceCols, tradingInsightCols } from "./utils";
import { STAT_PIVOT_HIGH, STAT_SIMPLE_HIGH } from "./constants";


/**
 * [MinuteCandleFeatures]
 * 1분봉 기반 기술적 지표 (종목별 Fact)
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

        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        stockCode: varchar("stock_code", { length: 10 })
            .notNull()
            .references(() => stocks.stockCode),

        ...commonCandleFeatureCols(),

        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        unique("uq_minute_features_candle_id").on(table.minuteCandleId),
        index("idx_minute_features_date_code_time").on(table.tradeDate, table.stockCode, table.tradeTime),
        index("idx_minute_features_pullback").on(table.pullbackFromDayHigh),
    ]
);

/**
 * [ThemeFeatures]
 * 테마별 집계 지표 (테마별 Fact)
 */
export const themeFeatures = pgTable(
    "theme_features",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        themeId: bigint("theme_id", { mode: "bigint" })
            .notNull()
            .references(() => themes.themeId),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),

        ...commonThemeStatsCols(),

        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("uq_theme_feature_time").on(table.themeId, table.tradeDate, table.tradeTime),
        index("idx_theme_feature_date_time").on(table.tradeDate, table.tradeTime),
    ]
);

/**
 * [ThemeStockContexts]
 * 테마 내 종목의 순위 및 관계 (Relation Fact)
 */
export const themeStockContexts = pgTable(
    "theme_stock_contexts",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        themeFeatureId: bigint("theme_feature_id", { mode: "bigint" })
            .notNull()
            .references(() => themeFeatures.id, { onDelete: "cascade" }),
        minuteFeatureId: bigint("minute_feature_id", { mode: "bigint" })
            .notNull()
            .references(() => minuteCandleFeatures.id),

        // 비정규화
        themeId: bigint("theme_id", { mode: "bigint" }).notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        closeRateKrx: numeric("close_rate_krx", { precision: 8, scale: 4 }).notNull(),
        closeRateNxt: numeric("close_rate_nxt", { precision: 8, scale: 4 }).notNull(),

        rankByRateKrx: integer("rank_by_rate_krx").notNull(),
        rankByRateNxt: integer("rank_by_rate_nxt").notNull(),
        rankByCumulativeTradingAmount: integer("rank_by_cumulative_trading_amount").notNull(),

        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("uq_theme_stock_context").on(table.themeFeatureId, table.stockCode),
        index("idx_theme_stock_context_stock_time").on(table.tradeDate, table.stockCode, table.tradeTime),
        index("idx_theme_stock_context_theme_rank").on(table.themeFeatureId, table.rankByRateNxt),
    ]
);


/**
 * [TradingOpportunities]
 * 최종 마스터 검색 인덱스 (모든 데이터 비정규화)
 */
export const tradingOpportunities = pgTable(
    "trading_opportunities",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),

        // 1. 기본 식별 정보
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        stockName: varchar("stock_name", { length: 100 }).notNull(),
        themeId: bigint("theme_id", { mode: "bigint" }).notNull(),
        themeName: varchar("theme_name", { length: 100 }).notNull(),

        // 2. 포착 종목(Base Stock) 상세 비정규화 (utils.ts 재사용)
        ...commonCandleFeatureCols(),

        // 3. 포착 종목(Base Stock) 상세 비정규화 - theme stock context
        rankByRateKrx: integer("rank_by_rate_krx").notNull(),
        rankByRateNxt: integer("rank_by_rate_nxt").notNull(),
        rankByCumulativeTradingAmount: integer("rank_by_cumulative_trading_amount").notNull(),

        // 4. 테마 통계 전량 비정규화 (utils.ts 재사용)
        ...commonThemeStatsCols(),

        // 5. 슬롯 데이터 비정규화 (Slot 1 ~ N) - 상수에 따라 자동 생성
        ...generateDynamicSlots(),

        ...tradingInsightCols(),

        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("uq_trading_opp_stock_time").on(table.stockCode, table.tradeDate, table.tradeTime),
        index("idx_trading_opp_date").on(table.tradeDate),
        index("idx_trading_opp_stock").on(table.stockCode),
        index("idx_trading_opp_is_searchable").on(table.isSearchable),
        index("idx_trading_opp_type").on(table.tradeType)
    ]
);

/**
 * [DailyCandleFeatures]
 * 일봉 기반 기술적 지표 및 통계 (종목별 Daily Fact)
 */
export const dailyCandleFeatures = pgTable(
    "daily_candle_features",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),

        // 부모 일봉 데이터 연결 (1:1 관계)
        dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => dailyCandles.id, { onDelete: "cascade" }),

        // 빠른 조회를 위한 비정규화
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 })
            .notNull()
            .references(() => stocks.stockCode),

        /* =========================================
        * 🏔️ 1. 구조적 고점 (좌측 여백 20일 ~ 120일)
        * ========================================= */
        ...pivotHighFeatureCols(STAT_PIVOT_HIGH),

        /* =========================================
         * 📊 2. 단순 최고가 (N일 내)
         * ========================================= */
        ...simpleMaxPriceCols(STAT_SIMPLE_HIGH),

        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        // dailyCandleId 당 하나의 feature만 존재하도록 보장
        unique("uq_daily_features_candle_id").on(table.dailyCandleId),
        // 특정 날짜, 특정 종목의 지표 조회 최적화
        index("idx_daily_features_date_code").on(table.tradeDate, table.stockCode),
    ]
);


export type DailyCandleFeature = typeof dailyCandleFeatures.$inferSelect;
export type DailyCandleFeatureInsert = typeof dailyCandleFeatures.$inferInsert;
export type MinuteCandleFeatures = typeof minuteCandleFeatures.$inferSelect;
export type MinuteCandleFeaturesInsert = typeof minuteCandleFeatures.$inferInsert;
export type ThemeFeature = typeof themeFeatures.$inferSelect;
export type ThemeFeatureInsert = typeof themeFeatures.$inferInsert;
export type ThemeStockContext = typeof themeStockContexts.$inferSelect;
export type ThemeStockContextInsert = typeof themeStockContexts.$inferInsert;
export type TradingOpportunity = typeof tradingOpportunities.$inferSelect;
export type TradingOpportunityInsert = typeof tradingOpportunities.$inferInsert;
export type TradingInsight = ReturnType<typeof tradingInsightCols>;