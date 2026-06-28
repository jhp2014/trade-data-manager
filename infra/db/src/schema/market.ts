// infra/db/schema — 새 헥사고날 시장데이터 스키마. 전용 Postgres 스키마 `market`(레거시 public 과 격리).
// 설계 원칙(잠금): 본질(OHLCV)만 저장, 파생값(분봉거래대금·누적·등락률·전일종가·시총)은 저장 안 함 →
//   읽을 때 도메인 순수함수(core/market price.ts)로 계산. FK 없음(무결성은 ingest 가 (종목,날) 단위로 관리).
//   자연키 composite PK. 시총은 별 테이블(자가치유 일봉 overwrite 가 안 닿게).
import { pgSchema, varchar, date, time, numeric, primaryKey, index } from "drizzle-orm/pg-core";

export const market = pgSchema("market");

// 1. 일봉 — KRX + UN(통합) 평탄화. 수정주가 OHLCV + 소스 거래대금(원). (tradeDate, stockCode) 자연키.
export const dailyCandles = market.table(
    "daily_candles",
    {
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),

        openKrx: numeric("open_krx", { precision: 18, scale: 0 }).notNull(),
        highKrx: numeric("high_krx", { precision: 18, scale: 0 }).notNull(),
        lowKrx: numeric("low_krx", { precision: 18, scale: 0 }).notNull(),
        closeKrx: numeric("close_krx", { precision: 18, scale: 0 }).notNull(),
        volumeKrx: numeric("volume_krx", { precision: 20, scale: 0 }).notNull(),
        amountKrx: numeric("amount_krx", { precision: 22, scale: 0 }).notNull(),

        openUn: numeric("open_un", { precision: 18, scale: 0 }).notNull(),
        highUn: numeric("high_un", { precision: 18, scale: 0 }).notNull(),
        lowUn: numeric("low_un", { precision: 18, scale: 0 }).notNull(),
        closeUn: numeric("close_un", { precision: 18, scale: 0 }).notNull(),
        volumeUn: numeric("volume_un", { precision: 20, scale: 0 }).notNull(),
        amountUn: numeric("amount_un", { precision: 22, scale: 0 }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.tradeDate, t.stockCode] }),
        index("idx_daily_candles_date").on(t.tradeDate),
        index("idx_daily_candles_stock").on(t.stockCode),
    ],
);

// 2. 분봉 — UN(항상 존재) + KRX(nullable: 프리마켓/시간외 NXT단독엔 KRX 부재). (date,stock,time) 자연키.
//    파생(amount·누적·rate) 없음. FK 없음. 적재 단위 = (종목, 하루).
export const minuteCandles = market.table(
    "minute_candles",
    {
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeTime: time("trade_time").notNull(),

        openUn: numeric("open_un", { precision: 18, scale: 0 }).notNull(),
        highUn: numeric("high_un", { precision: 18, scale: 0 }).notNull(),
        lowUn: numeric("low_un", { precision: 18, scale: 0 }).notNull(),
        closeUn: numeric("close_un", { precision: 18, scale: 0 }).notNull(),
        volumeUn: numeric("volume_un", { precision: 20, scale: 0 }).notNull(),

        openKrx: numeric("open_krx", { precision: 18, scale: 0 }),
        highKrx: numeric("high_krx", { precision: 18, scale: 0 }),
        lowKrx: numeric("low_krx", { precision: 18, scale: 0 }),
        closeKrx: numeric("close_krx", { precision: 18, scale: 0 }),
        volumeKrx: numeric("volume_krx", { precision: 20, scale: 0 }),
    },
    (t) => [
        primaryKey({ columns: [t.tradeDate, t.stockCode, t.tradeTime] }),
        index("idx_minute_candles_search").on(t.stockCode, t.tradeDate, t.tradeTime),
    ],
);

// 3. 종목 마스터 — 준정적(덮어쓰기). market = 거래소/코스닥(개별주식). ipoPrice = 공모가(최근상장만).
export const stockMaster = market.table("stock_master", {
    stockCode: varchar("stock_code", { length: 10 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    market: varchar("market", { length: 20 }).notNull(),
    listingDate: date("listing_date"),
    ipoPrice: numeric("ipo_price", { precision: 18, scale: 0 }),
});

// 4. 당일 시총 — 별 테이블(자가치유 일봉 overwrite 가 안 닿게). 시총 = 원주가 KRX_close(D-1) × shares(D).
export const dailyMarketCap = market.table(
    "daily_market_cap",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        marketCap: numeric("market_cap", { precision: 22, scale: 0 }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.stockCode, t.tradeDate] })],
);

export type DailyCandleRow = typeof dailyCandles.$inferSelect;
export type DailyCandleInsert = typeof dailyCandles.$inferInsert;
export type MinuteCandleRow = typeof minuteCandles.$inferSelect;
export type MinuteCandleInsert = typeof minuteCandles.$inferInsert;
export type StockMasterRow = typeof stockMaster.$inferSelect;
export type DailyMarketCapRow = typeof dailyMarketCap.$inferSelect;
