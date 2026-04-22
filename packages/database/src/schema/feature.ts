import {
    pgTable,
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
import { dailyCandles, minuteCandles, stocks } from "./market"; // 원천 데이터 스키마 파일

/**
 * [MinuteCandleFeatures]
 * 1분봉(Minute Candle)을 기반으로 계산된 각종 기술적 특징(Features)을 저장하는 테이블.
 * 1분봉 데이터와 1:1 관계를 가지며, 검색 최적화를 위해 일부 컬럼을 역정규화하여 포함함.
 */
export const minuteCandleFeatures = pgTable(
    "minute_candle_features",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),

        // 1. 관계 설정 (Foreign Keys)
        // 이 특징이 어떤 '1분봉'에서 계산되었는지 직접 연결
        minuteCandleId: bigint("minute_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => minuteCandles.id, { onDelete: "cascade" }),

        // 조회 성능을 위해 일봉 ID도 포함 (특정 일자 전체 분봉 특징 조회 시 유용)
        dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => dailyCandles.id, { onDelete: "cascade" }),

        // 2. 검색 및 필터링용 역정규화 컬럼
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        stockCode: varchar("stock_code", { length: 10 })
            .notNull()
            .references(() => stocks.stockCode),

        // 3. 주요 가격 및 등락 지표
        currentRate: numeric("current_rate", { precision: 10, scale: 1 }).notNull(), // currentChangeRate -> currentRate
        currentTradingAmount: numeric("current_trading_amount", { precision: 18, scale: 1 }), // TradingValue -> TradingAmount
        cumulativeTradingAmount: numeric("cumulative_trading_amount", { precision: 18, scale: 1 }).notNull(),

        // 4. 모멘텀 지표 (N분 전 대비 등락률)
        changeRate5m: numeric("change_rate_5m", { precision: 10, scale: 1 }),
        changeRate10m: numeric("change_rate_10m", { precision: 10, scale: 1 }),
        changeRate30m: numeric("change_rate_30m", { precision: 10, scale: 1 }),
        changeRate60m: numeric("change_rate_60m", { precision: 10, scale: 1 }),

        // 5. 고점 및 눌림목 관련 지표
        validDayHighRate: numeric("valid_day_high_rate", { precision: 10, scale: 1 }), // validDayHighChangeRate -> validDayHighRate
        validDayHighTime: time("valid_day_high_time"),
        pullbackFromDayHigh: numeric("pullback_from_day_high", { precision: 10, scale: 1 }),
        minutesSinceDayHigh: integer("minutes_since_day_high"),

        // 6. 거래대금 밀집도 관련 (예: 1분간 거래대금이 X억 이상 발생한 횟수 등)
        // SQL 스크립트에 있던 count_trading_value 시리즈를 TradingAmount로 매핑
        countTradingAmountGe30: integer("count_trading_amount_ge_30").notNull().default(0),
        countTradingAmountGe50: integer("count_trading_amount_ge_50").notNull().default(0),
        countTradingAmountGe100: integer("count_trading_amount_ge_100").notNull().default(0),

        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        // 1분봉당 특징 데이터는 오직 하나만 존재 (데이터 무결성)
        unique("uq_minute_features_candle_id").on(table.minuteCandleId),

        // 특정 날짜의 종목을 시간순으로 빠르게 조회하기 위한 인덱스
        index("idx_minute_features_date_code_time").on(
            table.tradeDate,
            table.stockCode,
            table.tradeTime
        ),

        // 고점 대비 하락폭(눌림목) 검색 성능 향상
        index("idx_minute_features_pullback").on(table.pullbackFromDayHigh),
    ]
);

// Drizzle에서 사용할 Insert/Select 타입 정의 (개발 시 편리함)
export type MinuteCandleFeature = typeof minuteCandleFeatures.$inferSelect;
export type MinuteCandleFeatureInsert = typeof minuteCandleFeatures.$inferInsert;