import {
    pgTableCreator,
    varchar,
    bigint,
    numeric,
    date,
    time,
    bigserial,
    unique,
    index,
    boolean
} from "drizzle-orm/pg-core";

/**
 * pgTableCreator를 사용하면 pgTable의 취소선(Deprecated) 문제를 해결할 수 있고,
 * 나중에 테이블 접두사(Prefix)를 붙이기도 용이해져서 실무에서 선호하는 방식이야.
 */
export const pgTable = pgTableCreator((name) => name);

// 1. 종목 마스터
export const stocks = pgTable("stocks", {
    stockCode: varchar("stock_code", { length: 10 }).primaryKey(),
    stockName: varchar("stock_name", { length: 100 }).notNull(),
    marketName: varchar("market_name", { length: 50 }),
    isNxtAvailable: boolean("is_nxt_available").default(false),
});

// 2. 테마 마스터
export const themes = pgTable("themes", {
    themeId: bigserial("theme_id", { mode: "bigint" }).primaryKey(),
    themeName: varchar("theme_name", { length: 100 }).notNull().unique(),
});

// 3. 일봉 차트 (KRX / INTEGRATED 통합 관리)
export const dailyCandles = pgTable("daily_candles", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tradeDate: date("trade_date").notNull(),
    stockCode: varchar("stock_code", { length: 10 }).notNull().references(() => stocks.stockCode),
    source: varchar("source", { length: 20 }).notNull().default("KRX"),

    open: numeric("open_price", { precision: 18, scale: 0 }).notNull(),
    high: numeric("high_price", { precision: 18, scale: 0 }).notNull(),
    low: numeric("low_price", { precision: 18, scale: 0 }).notNull(),
    close: numeric("close_price", { precision: 18, scale: 0 }).notNull(),

    tradingVolume: bigint("trading_volume", { mode: "bigint" }).notNull(),
    tradingAmount: numeric("trading_amount", { precision: 18, scale: 0 }).notNull(),

    // [수정] 등락률(%값) 대신 계산의 원천이 되는 전일 종가를 저장해
    // 분봉에서 %를 계산할 때 이 값들을 참조하게 될 거야.
    prevCloseKrx: numeric("prev_close_krx", { precision: 18, scale: 0 }),
    prevCloseNxt: numeric("prev_close_nxt", { precision: 18, scale: 0 }),
    changeValue: numeric("change_value", { precision: 18, scale: 0 }),

    marketCap: bigint("market_cap", { mode: "bigint" }),
    listedShares: bigint("listed_shares", { mode: "bigint" }),
    floatingShares: bigint("floating_shares", { mode: "bigint" }),
}, (table) => [
    // AI가 제안한 이 콜백 스타일이 복합 유니크 설정에 가장 적합해!
    unique("uq_daily_candles_date_stock_source").on(
        table.tradeDate,
        table.stockCode,
        table.source
    ),
    index("idx_daily_candles_date").on(table.tradeDate),
    index("idx_daily_candles_stock_code").on(table.stockCode),
]);

// 4. 분봉 차트
export const minuteCandles = pgTable("minute_candles", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
        .notNull()
        .references(() => dailyCandles.id, { onDelete: "cascade" }),

    tradeTime: time("trade_time").notNull(),
    open: numeric("open_price", { precision: 18, scale: 0 }).notNull(),
    high: numeric("high_price", { precision: 18, scale: 0 }).notNull(),
    low: numeric("low_price", { precision: 18, scale: 0 }).notNull(),
    close: numeric("close_price", { precision: 18, scale: 0 }).notNull(),

    tradingVolume: bigint("trading_volume", { mode: "bigint" }).notNull(),
    // [추가] 분봉 거래대금
    tradingAmount: numeric("trading_amount", { precision: 18, scale: 0 }).notNull(),

    // [추가] KRX / NXT 전일 종가 대비 등락률 (%)
    // 그래프 그릴 때 연산 없이 바로 가져다 쓸 수 있게 미리 계산해서 저장할 용도야.
    openRateKrx: numeric("open_rate_krx", { precision: 8, scale: 4 }),
    highRateKrx: numeric("high_rate_krx", { precision: 8, scale: 4 }),
    lowRateKrx: numeric("low_rate_krx", { precision: 8, scale: 4 }),
    closeRateKrx: numeric("close_rate_krx", { precision: 8, scale: 4 }),

    openRateNxt: numeric("open_rate_nxt", { precision: 8, scale: 4 }),
    highRateNxt: numeric("high_rate_nxt", { precision: 8, scale: 4 }),
    lowRateNxt: numeric("low_rate_nxt", { precision: 8, scale: 4 }),
    closeRateNxt: numeric("close_rate_nxt", { precision: 8, scale: 4 }),
}, (table) => [
    unique("uq_minute_candles_candle_time").on(table.dailyCandleId, table.tradeTime),
    index("idx_minute_candles_daily_id").on(table.dailyCandleId),
]);

// 5. 종목-테마 매핑
export const dailyThemeMappings = pgTable("daily_theme_mappings", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    themeId: bigint("theme_id", { mode: "bigint" }).notNull().references(() => themes.themeId),
    dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
        .notNull()
        .references(() => dailyCandles.id, { onDelete: "cascade" }),
}, (table) => [
    unique("uq_daily_theme_mapping").on(table.themeId, table.dailyCandleId),
    index("idx_daily_theme_mapping_candle").on(table.dailyCandleId),
]);

// 6. 실시간 프로그램 매매 동향 (금액 중심)
export const intradayProgramAmount = pgTable("intraday_program_amounts", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
        .notNull()
        .references(() => dailyCandles.id, { onDelete: "cascade" }),

    tradeTime: time("trade_time").notNull(),

    sellAmount: numeric("sell_amount", { precision: 18, scale: 0 }).notNull(),
    buyAmount: numeric("buy_amount", { precision: 18, scale: 0 }).notNull(),
    netBuyAmount: numeric("net_buy_amount", { precision: 18, scale: 0 }).notNull(),
}, (table) => [
    unique("uq_intraday_program_time").on(table.dailyCandleId, table.tradeTime),
    index("idx_program_amounts_time").on(table.tradeTime),
]);