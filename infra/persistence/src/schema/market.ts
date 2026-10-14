// infra/db/schema — 새 헥사고날 시장데이터 스키마. 전용 Postgres 스키마 `market`(레거시 public 과 격리).
// 설계 원칙(잠금): 본질만 저장, 파생값(분봉거래대금·누적·등락률·전일종가)은 저장 안 함 →
//   읽을 때 도메인 순수함수(core/market price.ts)로 계산. FK 없음(무결성은 ingest 가 (종목,날) 단위로 관리).
//   자연키 composite PK.
//   ※ 시총(daily_market_cap.market_cap)은 형식상 파생이지만 **외부 소스(KRX)가 그 값으로 주는 것**이라
//     받아 적는다 — 우리가 계산해 저장하는 게 아니다(계산하면 정의가 갈린다). 별 테이블인 이유는
//     자가치유 일봉 overwrite 가 안 닿게 하기 위함.
//
// 수치 표현(잠금): 한국 주가/수량/금액은 전부 정수(원·주). 가격류는 integer(원 단가는 int 범위 안전),
//   수량·금액류는 bigint 로 저장한다(과거 numeric → 행/인덱스 축소 + 비교/집계 가속). 도메인은 여전히
//   무손실 string 계약이므로(model.ts) 매퍼 경계에서만 integer↔Number / bigint↔String 변환한다.
//   bigint 는 mode:"bigint"(네이티브 BigInt) — string 왕복이 무손실.
import { sql } from "drizzle-orm";
import { pgSchema, varchar, date, time, timestamp, integer, bigint, text, jsonb, primaryKey, index } from "drizzle-orm/pg-core";

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

// 1b. 원주가(미수정) 일봉 — daily_candles 의 불변 쌍둥이. 구조는 동일(KRX+UN OHLCV+거래대금)하나 **의미가 다르다**:
//    daily_candles 는 수정주가라 소급조정 시 전체 덮어써짐(자가치유). 이 테이블은 **원주가**(kiwoom upd_stkpc_tp:"0")로
//    사후 절대 안 바뀌는 진실 → append-only(onConflictDoNothing), 치유 안 함. dailyMarketCap 을 별테이블로 뺀 것과
//    같은 이유(자가치유 overwrite 가 안 닿게). 쓰임: 분봉 %기준(전일 원종가) + 수정계수 역산(adj_close/raw_close).
//    접근패턴이 종목단위(범위조회)뿐이라(날짜 전종목 스캔은 수정본 담당) PK (stockCode, tradeDate) 하나가 곧 최적 인덱스.
export const dailyCandlesRaw = market.table(
    "daily_candles_raw",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),

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
    (t) => [primaryKey({ columns: [t.stockCode, t.tradeDate] })],
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

// 4. 일별 종목 속성 — 별 테이블(자가치유 일봉 overwrite 가 안 닿게). 이름은 `daily_market_cap` 이지만
//    내용은 (종목, 날)의 일별 속성 3종이고, **KRX 일별매매정보를 가공 없이 받아 적는다**(우리 계산 0):
//      · marketCap  = MKTCAP    — 그 날 종가 × 그 날 상장주식수(**당일** 기준)
//      · listShares = LIST_SHRS — 그 날 상장주식수
//      · sectTpNm   = SECT_TP_NM— 그 날 소속부. **원문 그대로**("관리종목(소속부없음)" 등, 파싱 금지).
//        KOSPI 는 전부 빈값이라 코스닥 전용 정보 → NULL.
//    ⚠ 시총 축은 이 테이블의 **D-1 행**을 읽는다 — marketCap 이 당일 종가를 품어 D 칸에 그대로 쓰면
//      "하루 시작 전 재료만" 규칙을 깬다(D-1 행 = 전일 종가 × 전일 상장주식수 = 아침에 보는 시총).
//    listShares 는 NOT NULL(마이그 0014 — KRX 재백필로 전량을 덮은 뒤 조였다).
//    sectTpNm 만 NULL 허용 — KOSPI 는 소속부가 빈값이라 결손이 정상이다.
export const dailyMarketCap = market.table(
    "daily_market_cap",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        marketCap: bigint("market_cap", { mode: "bigint" }).notNull(),
        listShares: bigint("list_shares", { mode: "bigint" }).notNull(),
        sectTpNm: varchar("sect_tp_nm", { length: 40 }),
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

// 6. 텔레그램 뉴스 방 아카이브 — NEWS_CHANNELS 9방의 메시지 전부(2023~). stock_news(헤드라인+종목태그)와 합치지 않는다
//    (decisions.md 「텔레그램 뉴스 방 아카이브」). 종목 태깅·조회수 없음. raw = GramJS 원본 순수 JSON(지운 메시지 보험).
//    search_text 는 STORED 생성 컬럼(본문+미리보기 제목+설명) + pg_trgm GIN — 표현식 인덱스는 질의 식이 한 글자만
//    달라도 조용히 인덱스를 안 타므로 컬럼으로 못 박는다. ⚠ INSERT/UPSERT SET 에서 반드시 제외(생성 컬럼).
//    channel_id 는 -100 접두 없는 양수. grouped_id·photo_id 는 int64 → bigint(mode bigint, 도메인은 string).
export const telegramChannel = market.table("telegram_channel", {
    channelId: bigint("channel_id", { mode: "number" }).primaryKey(),
    /** NEWS_CHANNELS 레지스트리 키(@username 또는 id 문자열) — 표시명과 조인하는 손잡이. */
    peer: varchar("peer", { length: 64 }).notNull(),
    username: varchar("username", { length: 64 }),
    title: text("title").notNull(),
    /** 일일 sync 커서 — 패스를 완주했을 때만 갱신(중단 구멍 방지). synced_at 은 읽기 coverage 의 근거. */
    syncedMaxId: integer("synced_max_id"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
});

export const telegramMessage = market.table(
    "telegram_message",
    {
        channelId: bigint("channel_id", { mode: "number" }).notNull(),
        msgId: integer("msg_id").notNull(),

        postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
        editedAt: timestamp("edited_at", { withTimezone: true }),
        text: text("text").notNull(),
        /** 서식 엔티티 [{type, offset, length, url?}] — 글자 뒤 숨은 링크(TextUrl)가 여기 있다. */
        entities: jsonb("entities").$type<Array<{ type: string; offset: number; length: number; url?: string }>>().notNull(),

        wpUrl: text("wp_url"),
        wpTitle: text("wp_title"),
        wpDescription: text("wp_description"),
        wpSite: varchar("wp_site", { length: 120 }),

        fwdChannelId: bigint("fwd_channel_id", { mode: "number" }),
        fwdMsgId: integer("fwd_msg_id"),
        fwdFromName: text("fwd_from_name"),
        fwdPostedAt: timestamp("fwd_posted_at", { withTimezone: true }),

        replyToMsgId: integer("reply_to_msg_id"),
        groupedId: bigint("grouped_id", { mode: "bigint" }),
        mediaKind: varchar("media_kind", { length: 12 }).notNull(),
        photoId: bigint("photo_id", { mode: "bigint" }),
        raw: jsonb("raw").notNull(),

        searchText: text("search_text").generatedAlwaysAs(
            sql`coalesce("text", '') || E'
' || coalesce("wp_title", '') || E'
' || coalesce("wp_description", '')`,
        ),
    },
    (t) => [
        primaryKey({ columns: [t.channelId, t.msgId] }),
        index("telegram_message_posted_at_idx").on(t.postedAt),
        index("telegram_message_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
    ],
);

// 당일 종목 코멘트(daily_comments)는 사람이 큐레이션하는 편집 데이터라 `curation` 스키마에 있다 → schema/curation.ts.

export type DailyCandleRow = typeof dailyCandles.$inferSelect;
export type DailyCandleInsert = typeof dailyCandles.$inferInsert;
export type DailyCandleRawRow = typeof dailyCandlesRaw.$inferSelect;
export type DailyCandleRawInsert = typeof dailyCandlesRaw.$inferInsert;
export type MinuteCandleRow = typeof minuteCandles.$inferSelect;
export type MinuteCandleInsert = typeof minuteCandles.$inferInsert;
export type StockMasterRow = typeof stockMaster.$inferSelect;
export type StockMasterInsert = typeof stockMaster.$inferInsert;
export type DailyMarketCapRow = typeof dailyMarketCap.$inferSelect;
export type DailyMarketCapInsert = typeof dailyMarketCap.$inferInsert;
export type StockNewsRow = typeof stockNews.$inferSelect;
export type StockNewsInsert = typeof stockNews.$inferInsert;
export type TelegramChannelRow = typeof telegramChannel.$inferSelect;
export type TelegramChannelInsert = typeof telegramChannel.$inferInsert;
export type TelegramMessageRow = typeof telegramMessage.$inferSelect;
export type TelegramMessageInsert = typeof telegramMessage.$inferInsert;
