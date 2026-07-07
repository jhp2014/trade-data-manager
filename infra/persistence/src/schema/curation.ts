// infra/db/schema — `curation` Postgres 스키마: 사람이 편집/큐레이션하는 시장 주석.
// 수집/기계생성(candles·market_cap·news·stock_master = `market`)과 물리 격리. FK 없음(무결성은 앱이 관리).
// 여기 3테이블은 성격이 같다: 사람이 손으로 넣고 지우는 편집 데이터.
//   · daily_issues  : 당일 촉매 분류(원래 market 에 있었으나 성격상 이관 — 자연키 PK)
//   · price_lines   : 차트 수평 가격선((종목,날짜) 당 N개, price 가변 → surrogate id)
//   · review_points : 복기 타점((종목,날짜,시각) 자연키 = caseId. hypothesis 가 하류에서 읽어 의미 부여)
//
// 수치 표현(잠금): 가격류는 integer(원 단가 int 안전). 도메인은 무손실 string 계약 → 매퍼 경계에서만 변환.
import { pgSchema, varchar, date, time, timestamp, text, bigint, bigserial, primaryKey, foreignKey, unique, index } from "drizzle-orm/pg-core";

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
//    **가격 대신 앵커(캔들 좌표)를 저장**한다: 값은 표시 시점에 그 캔들에서 읽으므로, 수정계수가 바뀌어도
//    선이 자동으로 따라간다(가격 재수정 불필요). anchorTime NULL=일봉 앵커 / 값 있음=분봉 앵커.
//    여러 선이 같은 앵커를 가질 수 있어(field/memo 만 다르게) 여전히 자연키 없음 → surrogate bigserial id PK.
//    index(stock,date) = "이 차트의 선들" 로드용. 선끼리도 FK 없음.
export const priceLines = curation.table(
    "price_lines",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(), // 이 선이 속한 차트(로드 단위)
        anchorDate: date("anchor_date").notNull(), // 값을 읽어올 앵커 캔들의 거래일
        anchorTime: time("anchor_time"), // nullable → 일봉 앵커 / 값 있으면 분봉 앵커
        field: varchar("field", { length: 5 }).notNull().default("high"), // high|low|open|close
        memo: text("memo"),
    },
    (t) => [index("idx_price_lines_chart").on(t.stockCode, t.tradeDate)],
);

// 3. 복기 타점 — 차트에서 찍은 타점. 자연키 (stockCode, tradeDate, tradeTime) 삼중키(시각 필수).
//    **옛 case 를 흡수** = 이 타점이 곧 case. type(셋업 유형)·outcome(트레이드 결과)·memo 는 타점 자체 속성.
//    가설(hypotheses)이 이 자연키를 하류에서 참조. PK 가 (stock,date) prefix 커버 → listByChart 별도 인덱스 불필요.
export const reviewPoints = curation.table(
    "review_points",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        type: varchar("type", { length: 40 }), // 셋업 유형 라벨(선택). 값·트리는 클라 config.
        outcome: varchar("outcome", { length: 20 }), // 트레이드 결과(선택, 가설 무관).
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

// 4. 가설 — 매매 가설 원본. 표시코드 H1 은 저장 안 하고 id 에서 파생. tags/status/extra 없음(필요시 나중).
export const hypotheses = curation.table("hypotheses", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    text: text("text").notNull(),
});

// 5. 가설 ↔ 복기 타점 연결 — 순수 정션(자연키). surrogate 없이 composite PK.
//    review_points 삼중키로 FK(onDelete cascade: 타점 지우면 연결도). hypothesis 지워도 cascade.
export const hypothesisPoints = curation.table(
    "hypothesis_points",
    {
        hypothesisId: bigint("hypothesis_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.hypothesisId, t.stockCode, t.tradeDate, t.tradeTime] }),
        foreignKey({
            columns: [t.stockCode, t.tradeDate, t.tradeTime],
            foreignColumns: [reviewPoints.stockCode, reviewPoints.tradeDate, reviewPoints.tradeTime],
            name: "fk_hyp_points_review_point",
        }).onDelete("cascade"),
        index("idx_hyp_points_point").on(t.stockCode, t.tradeDate, t.tradeTime),
    ],
);

// 6. 가설 그래프 — 가설 사이 관계(트리 아님). relationType 느슨(better_than/parent_of/similar_to/conflicts_with…).
//    순환/자기참조는 DB 제약 아닌 App 경고. idx_to = 역방향("나를 가리키는 관계") 조회용.
export const hypothesisRelations = curation.table(
    "hypothesis_relations",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        fromId: bigint("from_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        toId: bigint("to_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        relationType: varchar("relation_type", { length: 20 }).notNull(),
        note: text("note"),
    },
    (t) => [
        unique("uq_hyp_rel").on(t.fromId, t.relationType, t.toId),
        index("idx_hyp_rel_to").on(t.toId),
    ],
);

export type HypothesisRow = typeof hypotheses.$inferSelect;
export type HypothesisInsert = typeof hypotheses.$inferInsert;
export type HypothesisPointRow = typeof hypothesisPoints.$inferSelect;
export type HypothesisPointInsert = typeof hypothesisPoints.$inferInsert;
export type HypothesisRelationRow = typeof hypothesisRelations.$inferSelect;
export type HypothesisRelationInsert = typeof hypothesisRelations.$inferInsert;
