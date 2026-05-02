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
    regDay: date("reg_day"), // 상장일 (예: "2009-08-03")
});


// 2. 테마 마스터
export const themes = pgTable("themes", {
    themeId: bigserial("theme_id", { mode: "bigint" }).primaryKey(),
    themeName: varchar("theme_name", { length: 100 }).notNull().unique(),
});

// 3. 일봉 차트 - (tradeDate, stockCode) 기준 1 row에 KRX + NXT 데이터를 통합 보관
export const dailyCandles = pgTable("daily_candles", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tradeDate: date("trade_date").notNull(),
    stockCode: varchar("stock_code", { length: 10 }).notNull().references(() => stocks.stockCode),

    // KRX 가격 데이터
    openKrx: numeric("open_krx", { precision: 18, scale: 0 }).notNull(),
    highKrx: numeric("high_krx", { precision: 18, scale: 0 }).notNull(),
    lowKrx: numeric("low_krx", { precision: 18, scale: 0 }).notNull(),
    closeKrx: numeric("close_krx", { precision: 18, scale: 0 }).notNull(),

    // NXT 가격 데이터 (NXT 미지원 종목도 Kiwoom이 KRX값을 내려주므로 notNull)
    openNxt: numeric("open_nxt", { precision: 18, scale: 0 }).notNull(),
    highNxt: numeric("high_nxt", { precision: 18, scale: 0 }).notNull(),
    lowNxt: numeric("low_nxt", { precision: 18, scale: 0 }).notNull(),
    closeNxt: numeric("close_nxt", { precision: 18, scale: 0 }).notNull(),

    // KRX 거래량 / 거래대금
    tradingVolumeKrx: bigint("trading_volume_krx", { mode: "bigint" }).notNull(),
    tradingAmountKrx: numeric("trading_amount_krx", { precision: 18, scale: 0 }).notNull(),

    // NXT 거래량 / 거래대금
    tradingVolumeNxt: bigint("trading_volume_nxt", { mode: "bigint" }).notNull(),
    tradingAmountNxt: numeric("trading_amount_nxt", { precision: 18, scale: 0 }).notNull(),

    // 전일 종가 (분봉 등락률 계산의 기준)
    prevCloseKrx: numeric("prev_close_krx", { precision: 18, scale: 0 }),
    prevCloseNxt: numeric("prev_close_nxt", { precision: 18, scale: 0 }),

    // 전일 대비 변동값
    changeValueKrx: numeric("change_value_krx", { precision: 18, scale: 0 }),
    changeValueNxt: numeric("change_value_nxt", { precision: 18, scale: 0 }),

    // 종목 기본 정보 (KRX 기준)
    marketCap: bigint("market_cap", { mode: "bigint" }),
    listedShares: bigint("listed_shares", { mode: "bigint" }),
    floatingShares: bigint("floating_shares", { mode: "bigint" }),
}, (table) => [
    unique("uq_daily_candles_date_stock").on(table.tradeDate, table.stockCode),
    index("idx_daily_candles_date").on(table.tradeDate),
    index("idx_daily_candles_stock_code").on(table.stockCode),
]);


// 4. 분봉 차트
export const minuteCandles = pgTable("minute_candles", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),

    // FK (무결성 유지용)
    dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
        .notNull()
        .references(() => dailyCandles.id, { onDelete: "cascade" }),

    // [비정규화 컬럼 추가] 조회 성능 극대화를 위해 추가
    tradeDate: date("trade_date").notNull(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),

    tradeTime: time("trade_time").notNull(),
    unixTimestamp: bigint("unix_timestamp", { mode: "number" }).notNull(),

    open: numeric("open_price", { precision: 18, scale: 0 }).notNull(),
    high: numeric("high_price", { precision: 18, scale: 0 }).notNull(),
    low: numeric("low_price", { precision: 18, scale: 0 }).notNull(),
    close: numeric("close_price", { precision: 18, scale: 0 }).notNull(),

    tradingVolume: bigint("trading_volume", { mode: "bigint" }).notNull(),
    tradingAmount: numeric("trading_amount", { precision: 18, scale: 0 }).notNull(),
    accumulatedTradingAmount: numeric("accumulated_trading_amount", { precision: 18, scale: 0 }).notNull(),

    openRateKrx: numeric("open_rate_krx", { precision: 8, scale: 4 }),
    highRateKrx: numeric("high_rate_krx", { precision: 8, scale: 4 }),
    lowRateKrx: numeric("low_rate_krx", { precision: 8, scale: 4 }),
    closeRateKrx: numeric("close_rate_krx", { precision: 8, scale: 4 }),

    openRateNxt: numeric("open_rate_nxt", { precision: 8, scale: 4 }),
    highRateNxt: numeric("high_rate_nxt", { precision: 8, scale: 4 }),
    lowRateNxt: numeric("low_rate_nxt", { precision: 8, scale: 4 }),
    closeRateNxt: numeric("close_rate_nxt", { precision: 8, scale: 4 }),
}, (table) => [
    // 1. 유니크 제약 조건: 동일 날짜, 동일 종목의 동일 시간 분봉은 하나만 존재해야 함
    unique("uq_minute_candles_time").on(table.tradeDate, table.stockCode, table.tradeTime),

    // 2. 핵심 조회용 복합 인덱스: "특정 종목의 특정 날짜 차트를 시간순으로 조회"할 때 최적화
    index("idx_minute_candles_search").on(table.stockCode, table.tradeDate, table.tradeTime),

    // 3. FK 인덱스 (Drizzle/Postgres에서 JOIN 성능을 위해 필요)
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

    // 비정규화
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    tradeDate: date("trade_date").notNull(),
    tradeTime: time("trade_time").notNull(),

    sellAmount: numeric("sell_amount", { precision: 18, scale: 0 }).notNull(),
    buyAmount: numeric("buy_amount", { precision: 18, scale: 0 }).notNull(),
    netBuyAmount: numeric("net_buy_amount", { precision: 18, scale: 0 }).notNull(),
}, (table) => [
    unique("uq_intraday_program_time").on(table.dailyCandleId, table.tradeTime),
    index("idx_program_amounts_time").on(table.tradeTime),
]);

// 타입 정의
export type Stock = typeof stocks.$inferSelect;
export type StockInsert = typeof stocks.$inferInsert;
export type DailyCandle = typeof dailyCandles.$inferSelect;
export type DailyCandleInsert = typeof dailyCandles.$inferInsert;
export type MinuteCandle = typeof minuteCandles.$inferSelect;
export type MinuteCandleInsert = typeof minuteCandles.$inferInsert;
export type Theme = typeof themes.$inferSelect;
export type ThemeInsert = typeof themes.$inferInsert;

