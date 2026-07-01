// infra/db/schema — 새 헥사고날 시장데이터 스키마. 전용 Postgres 스키마 `market`(레거시 public 과 격리).
// 설계 원칙(잠금): 본질(OHLCV)만 저장, 파생값(분봉거래대금·누적·등락률·전일종가·시총)은 저장 안 함 →
//   읽을 때 도메인 순수함수(core/market price.ts)로 계산. FK 없음(무결성은 ingest 가 (종목,날) 단위로 관리).
//   자연키 composite PK. 시총은 별 테이블(자가치유 일봉 overwrite 가 안 닿게).
//
// 수치 표현(잠금): 한국 주가/수량/금액은 전부 정수(원·주). 가격류는 integer(원 단가는 int 범위 안전),
//   수량·금액류는 bigint 로 저장한다(과거 numeric → 행/인덱스 축소 + 비교/집계 가속). 도메인은 여전히
//   무손실 string 계약이므로(model.ts) 매퍼 경계에서만 integer↔Number / bigint↔String 변환한다.
//   bigint 는 mode:"bigint"(네이티브 BigInt) — string 왕복이 무손실.
import { pgSchema, varchar, date, time, integer, bigint, text, primaryKey, index } from "drizzle-orm/pg-core";

export const market = pgSchema("market");

// 1. 일봉 — KRX + UN(통합) 평탄화. 수정주가 OHLCV + 소스 거래대금(원). (tradeDate, stockCode) 자연키.
export const dailyCandles = market.table(
    "daily_candles",
    {
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),

        openKrx: integer("open_krx").notNull(),
        highKrx: integer("high_krx").notNull(),
        lowKrx: integer("low_krx").notNull(),
        closeKrx: integer("close_krx").notNull(),
        volumeKrx: bigint("volume_krx", { mode: "bigint" }).notNull(),
        amountKrx: bigint("amount_krx", { mode: "bigint" }).notNull(),

        openUn: integer("open_un").notNull(),
        highUn: integer("high_un").notNull(),
        lowUn: integer("low_un").notNull(),
        closeUn: integer("close_un").notNull(),
        volumeUn: bigint("volume_un", { mode: "bigint" }).notNull(),
        amountUn: bigint("amount_un", { mode: "bigint" }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.tradeDate, t.stockCode] }),
        index("idx_daily_candles_date").on(t.tradeDate),
        index("idx_daily_candles_stock").on(t.stockCode),
    ],
);

// 2. 분봉 — UN(항상 존재) + KRX(nullable: 프리마켓/시간외 NXT단독엔 KRX 부재). (date,stock,time) 자연키.
//    파생(amount·누적·rate) 없음. FK 없음. 적재 단위 = (종목, 하루).
//    PK = (stockCode, tradeDate, tradeTime): 읽기는 "한 종목의 하루"(stock+date prefix, time 정렬)라 PK 가
//    커버 → 별도 인덱스 불필요. date-only 존재조회는 파티션 프루닝이 대체.
//    물리: trade_date RANGE 월별 파티션(대용량). 파티셔닝/파티션생성은 drizzle 로 표현 불가라
//    마이그레이션 SQL 에서 수작업(이 스키마는 타입/쿼리용 부모 뷰). PK 에 파티션키(trade_date) 포함 필수.
export const minuteCandles = market.table(
    "minute_candles",
    {
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeTime: time("trade_time").notNull(),

        openUn: integer("open_un").notNull(),
        highUn: integer("high_un").notNull(),
        lowUn: integer("low_un").notNull(),
        closeUn: integer("close_un").notNull(),
        volumeUn: bigint("volume_un", { mode: "bigint" }).notNull(),

        openKrx: integer("open_krx"),
        highKrx: integer("high_krx"),
        lowKrx: integer("low_krx"),
        closeKrx: integer("close_krx"),
        volumeKrx: bigint("volume_krx", { mode: "bigint" }),
    },
    (t) => [primaryKey({ columns: [t.stockCode, t.tradeDate, t.tradeTime] })],
);

// 3. 종목 마스터 — 준정적(덮어쓰기). market = 거래소/코스닥(개별주식). ipoPrice = 공모가(최근상장만).
export const stockMaster = market.table("stock_master", {
    stockCode: varchar("stock_code", { length: 10 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    market: varchar("market", { length: 20 }).notNull(),
    listingDate: date("listing_date"),
    ipoPrice: integer("ipo_price"),
});

// 4. 당일 시총 — 별 테이블(자가치유 일봉 overwrite 가 안 닿게). 시총 = 원주가 KRX_close(D-1) × shares(D).
export const dailyMarketCap = market.table(
    "daily_market_cap",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        marketCap: bigint("market_cap", { mode: "bigint" }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.stockCode, t.tradeDate] })],
);

// 5. 시황 뉴스(헤드라인) — KIS 종합시황(제목) 영구저장. 본문 없음. 한 헤드라인 다종목 태그 → (종목,srno) 행.
//    stock_code="" = 종목 미태깅(매크로·해외·스포츠 등 — 읽을 때 news_lrdv_code 로 필터). srno=cntt_usiq_srno(19자리,
//    시각 내장 전역 유니크 → bigint 무손실). 분봉과 동일: 본질만·FK없음·자연키 PK·published_date 월별 RANGE 파티션.
//    PK=(stock_code, published_date, srno): 주 조회 "한 종목의 기간"이 PK prefix 커버, published_date(파티션키) 포함.
export const stockNews = market.table(
    "stock_news",
    {
        publishedDate: date("published_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        srno: bigint("srno", { mode: "bigint" }).notNull(),

        publishedTime: time("published_time").notNull(),
        title: text("title").notNull(),
        sourceCode: varchar("source_code", { length: 4 }).notNull(),
        sourceName: varchar("source_name", { length: 40 }).notNull(),
        categoryCode: varchar("category_code", { length: 12 }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.stockCode, t.publishedDate, t.srno] })],
);

// 당일 이슈 분류(daily_issues)는 사람이 큐레이션하는 편집 데이터라 `curation` 스키마로 이관했다 → schema/curation.ts.

export type DailyCandleRow = typeof dailyCandles.$inferSelect;
export type DailyCandleInsert = typeof dailyCandles.$inferInsert;
export type MinuteCandleRow = typeof minuteCandles.$inferSelect;
export type MinuteCandleInsert = typeof minuteCandles.$inferInsert;
export type StockMasterRow = typeof stockMaster.$inferSelect;
export type StockMasterInsert = typeof stockMaster.$inferInsert;
export type DailyMarketCapRow = typeof dailyMarketCap.$inferSelect;
export type DailyMarketCapInsert = typeof dailyMarketCap.$inferInsert;
export type StockNewsRow = typeof stockNews.$inferSelect;
export type StockNewsInsert = typeof stockNews.$inferInsert;
