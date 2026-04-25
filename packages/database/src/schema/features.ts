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
import { STAT_RATES, STAT_AMOUNTS } from "../constants";


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

        closeRateKrx: numeric("close_rate_krx", { precision: 8, scale: 4 }).notNull(),
        closeRateNxt: numeric("close_rate_nxt", { precision: 8, scale: 4 }).notNull(),
        tradingAmount: numeric("trading_amount", { precision: 18, scale: 1 }).notNull(),
        cumulativeTradingAmount: numeric("cumulative_trading_amount", { precision: 18, scale: 1 }).notNull(),

        //구간별 거래대금 횟수
        ...cntNAmt(),

        changeRate5m: numeric("change_rate_5m", { precision: 8, scale: 4 }),
        changeRate10m: numeric("change_rate_10m", { precision: 8, scale: 4 }),
        changeRate30m: numeric("change_rate_30m", { precision: 8, scale: 4 }),
        changeRate60m: numeric("change_rate_60m", { precision: 8, scale: 4 }),
        changeRate120m: numeric("change_rate_120m", { precision: 8, scale: 4 }),

        dayHighRate: numeric("day_high_rate", { precision: 8, scale: 4 }),
        dayHighTime: time("day_high_time"),
        pullbackFromDayHigh: numeric("pullback_from_day_high", { precision: 8, scale: 4 }),
        minutesSinceDayHigh: integer("minutes_since_day_high"),

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

        avgRate: numeric("avg_rate", { precision: 8, scale: 4 }).notNull(),
        cntTotalStock: integer("cnt_total_stock").notNull().default(0),

        // 등락률 구간별 종목 수 카운트
        ...cntNRateStockNum(),

        // 거래대금 구간별 종목 수 카운트
        ...cntNAmtStockNum(),

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

        // 포착 종목(Base Stock) 상세 비정규화 - 분봉 feature
        closeRateKrx: numeric("close_rate_krx", { precision: 8, scale: 4 }).notNull(),
        closeRateNxt: numeric("close_rate_nxt", { precision: 8, scale: 4 }).notNull(),
        tradingAmount: numeric("trading_amount", { precision: 18, scale: 1 }).notNull(),
        cumulativeTradingAmount: numeric("cumulative_trading_amount", { precision: 18, scale: 1 }).notNull(),

        ...cntNAmt(),

        changeRate5m: numeric("change_rate_5m", { precision: 8, scale: 4 }),
        changeRate10m: numeric("change_rate_10m", { precision: 8, scale: 4 }),
        changeRate30m: numeric("change_rate_30m", { precision: 8, scale: 4 }),
        changeRate60m: numeric("change_rate_60m", { precision: 8, scale: 4 }),
        changeRate120m: numeric("change_rate_120m", { precision: 8, scale: 4 }),


        // 포착 종목(Base Stock) 상세 비정규화 - theme stock context
        rankByRateKrx: integer("rank_by_rate_krx").notNull(),
        rankByRateNxt: integer("rank_by_rate_nxt").notNull(),
        rankByCumulativeTradingAmount: integer("rank_by_cumulative_trading_amount").notNull(),


        // 테마 통계 전량 비정규화 (Theme Features)
        avgRate: numeric("avg_rate", { precision: 8, scale: 4 }).notNull(),
        cntTotalStock: integer("cnt_total_stock").notNull().default(0),
        ...cntNRateStockNum(),
        ...cntNAmtStockNum(),


        // 슬롯 데이터 비정규화 (Slot 1 ~ 6)
        ...slotColumns(1),
        ...slotColumns(2),
        ...slotColumns(3),
        ...slotColumns(4),
        ...slotColumns(5),
        ...slotColumns(6),

        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("uq_trading_opp_stock_time").on(table.stockCode, table.tradeDate, table.tradeTime),
        index("idx_trading_opp_date").on(table.tradeDate),
        index("idx_trading_opp_stock").on(table.stockCode),
    ]
);

// --- 헬퍼 함수 (반복되는 비정규화 컬럼 자동 생성) ---


function cntNRateStockNum() {
    const cols: any = {};
    STAT_RATES.forEach(r => {
        cols[`cnt${r}RateStockNum`] = integer(`cnt_${r}_rate_stock_num`).notNull().default(0);
    });
    return cols;
}


/**
 * 1. 거래대금 구간별 횟수 헬퍼 (중첩 가능하도록 prefix 추가)
 * @param tsPrefix TypeScript 객체 키값용 접두어 (예: 's1', 's2' 또는 '')
 * @param dbPrefix DB 컬럼명용 접두어 (예: 's1', 's2' 또는 '')
 */
function cntNAmt(tsPrefix: string = "", dbPrefix: string = "") {
    const cols: any = {};

    // 접두어가 있을 경우 언더바(_) 처리 여부 결정
    const tsPre = tsPrefix ? `${tsPrefix}Cnt` : "cnt";
    const dbPre = dbPrefix ? `${dbPrefix}_cnt` : "cnt";

    STAT_AMOUNTS.forEach(a => {
        // 예: s1Cnt20Amt (TS) / s1_cnt_20_amt (DB)
        cols[`${tsPre}${a}Amt`] = integer(`${dbPre}_${a}_amt`).notNull().default(0);
    });
    return cols;
}

function cntNAmtStockNum() {
    const cols: any = {};
    STAT_AMOUNTS.forEach(a => {
        cols[`cnt${a}AmtStockNum`] = integer(`cnt_${a}_amt_stock_num`).notNull().default(0);
    });
    return cols;
}


/**
 * 2. 슬롯별 컬럼 생성 헬퍼 (내부에서 cntNAmt 호출)
 */
function slotColumns(index: number) {
    const p = `s${index}`; // s1, s2, s3...

    return {
        [`${p}StockCode`]: varchar(`${p}_stock_code`, { length: 10 }),

        [`${p}RateKrx`]: numeric(`${p}_rate_krx`, { precision: 8, scale: 4 }),
        [`${p}RateNxt`]: numeric(`${p}_rate_nxt`, { precision: 8, scale: 4 }),
        [`${p}TradingAmount`]: numeric(`${p}_trading_amount`, { precision: 18, scale: 1 }),
        [`${p}CumulativeTradingAmount`]: numeric(`${p}_cumulative_trading_amount`, { precision: 18, scale: 1 }),

        [`${p}ChangeRate5m`]: numeric(`${p}_change_rate_5m`, { precision: 8, scale: 4 }),
        [`${p}ChangeRate10m`]: numeric(`${p}_change_rate_10m`, { precision: 8, scale: 4 }),
        [`${p}ChangeRate30m`]: numeric(`${p}_change_rate_30m`, { precision: 8, scale: 4 }),
        [`${p}ChangeRate60m`]: numeric(`${p}_change_rate_60m`, { precision: 8, scale: 4 }),
        [`${p}ChangeRate120m`]: numeric(`${p}_change_rate_120m`, { precision: 8, scale: 4 }),

        [`${p}DayHighRate`]: numeric(`${p}_day_high_rate`, { precision: 8, scale: 4 }),
        [`${p}DayHighTime`]: time(`${p}_day_high_time`),
        [`${p}PullbackFromDayHigh`]: numeric(`${p}_pullback_from_day_high`, { precision: 8, scale: 4 }),
        [`${p}MinutesSinceDayHigh`]: integer(`${p}_minutes_since_day_high`),

        ...cntNAmt(p, p)
    };
}


// --- 타입 정의 ---
export type MinuteCandleFeatures = typeof minuteCandleFeatures.$inferSelect;
export type MinuteCandleFeaturesInsert = typeof minuteCandleFeatures.$inferInsert;
export type ThemeFeature = typeof themeFeatures.$inferSelect;
export type ThemeFeatureInsert = typeof themeFeatures.$inferInsert;
export type ThemeStockContext = typeof themeStockContexts.$inferSelect;
export type ThemeStockContextInsert = typeof themeStockContexts.$inferInsert;
export type TradingOpportunity = typeof tradingOpportunities.$inferSelect;
export type TradingOpportunityInsert = typeof tradingOpportunities.$inferInsert;