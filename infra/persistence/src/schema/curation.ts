// infra/db/schema — `curation` Postgres 스키마: 사람이 편집/큐레이션하는 시장 주석.
// 수집/기계생성(candles·market_cap·news·stock_master = `market`)과 물리 격리. FK 없음(무결성은 앱이 관리).
// 여기 3테이블은 성격이 같다: 사람이 손으로 넣고 지우는 편집 데이터.
//   · daily_issues  : 당일 촉매 분류(원래 market 에 있었으나 성격상 이관 — 자연키 PK)
//   · price_lines   : 차트 수평 가격선((종목,날짜) 당 N개, price 가변 → surrogate id)
//   · review_points : 복기 타점((종목,날짜,시각) 자연키 = caseId. hypothesis 가 하류에서 읽어 의미 부여)
//
// 수치 표현(잠금): 가격류는 integer(원 단가 int 안전). 도메인은 무손실 string 계약 → 매퍼 경계에서만 변환.
import { pgSchema, varchar, date, time, timestamp, text, integer, bigserial, primaryKey, index } from "drizzle-orm/pg-core";

export const curation = pgSchema("curation");

// 1. 당일 이슈 분류 — 사람이 큐레이션하는 편집 데이터(원시수집 아님). "이 날, 이 종목이, 이 이슈로 움직였다".
//    종목의 정적 테마(=정체성)는 Google Sheet(종목 History)에 있고, 여기엔 당일 드라이버(촉매)만 담는다.
//    issue 가 그룹 키: 같은 (trade_date, issue) = 그날 같은 촉매로 같이 움직인 종목들(종목 가로지른 집계).
//    한 종목이 당일 2개 이슈면 2행. issue 미정이면 sentinel '미분류'. FK 없음(자연키 조인은 trade_date·stock_code).
//    편집모델: in-place 수정 없음 — 행 단위 add/delete 둘뿐("수정"=삭제+추가). 그래서 다른 테이블처럼
//    불변 자연키 composite PK (trade_date, stock_code, issue) 가 성립(issue 를 절대 갱신 안 하므로). 행이 독립이라
//    author 가 행마다 보존됨. add 는 ON CONFLICT DO NOTHING(분류기 재실행이 사람 편집을 안 덮게). 컨펌은 author 변경/삭제로.
export const dailyIssues = curation.table(
    "daily_issues",
    {
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        issue: varchar("issue", { length: 100 }).notNull().default("미분류"),
        comment: text("comment"),
        author: varchar("author", { length: 50 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.tradeDate, t.stockCode, t.issue] }),
        index("idx_daily_issues_date_issue").on(t.tradeDate, t.issue),
        index("idx_daily_issues_stock").on(t.stockCode),
    ],
);

// 2. 가격선 — 한 종목·거래일 차트에 그은 수평 가격선. (종목,날짜) 당 N개.
//    price 가 draggable(가변)이라 불변 자연키가 없다 → surrogate bigserial id PK(이 스키마 유일). 선끼리도 FK 없음.
//    createdAt 없음(선 자체 부기 불필요). index(stock,date) = "이 차트의 선들" 로드용.
export const priceLines = curation.table(
    "price_lines",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        price: integer("price").notNull(),
        memo: text("memo"),
    },
    (t) => [index("idx_price_lines_chart").on(t.stockCode, t.tradeDate)],
);

// 3. 복기 타점 — 차트에서 찍은 타점. 자연키 (stockCode, tradeDate, tradeTime) = caseId 삼중키.
//    가설 유무와 무관하게 독립 영속(먼저 있어야 hypothesis 가 붙일 대상). 의미의 풍성함은 하류 hypothesis 담당 →
//    여기선 가벼운 앵커 + memo 한 줄(jsonb payload 는 폐기). PK 가 (stock,date) prefix 커버 → listByChart 는 별도 인덱스 불필요.
export const reviewPoints = curation.table(
    "review_points",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        memo: text("memo"),
    },
    (t) => [primaryKey({ columns: [t.stockCode, t.tradeDate, t.tradeTime] })],
);

export type DailyIssueRow = typeof dailyIssues.$inferSelect;
export type DailyIssueInsert = typeof dailyIssues.$inferInsert;
export type PriceLineRow = typeof priceLines.$inferSelect;
export type PriceLineInsert = typeof priceLines.$inferInsert;
export type ReviewPointRow = typeof reviewPoints.$inferSelect;
export type ReviewPointInsert = typeof reviewPoints.$inferInsert;
