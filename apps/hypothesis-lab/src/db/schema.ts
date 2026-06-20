import {
    bigint,
    bigserial,
    date,
    index,
    jsonb,
    pgSchema,
    primaryKey,
    text,
    time,
    timestamp,
    unique,
    varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * 전용 Postgres schema.
 * data-core(public)와 물리적으로 같은 DB, 논리적으로 분리된 네임스페이스.
 * review 테이블과는 FK 없이 caseId(문자열)로만 얇게 연결한다.
 */
export const hypothesisSchema = pgSchema("hypothesis");

/** 모든 테이블 공통: App이 의미를 모르지만 화면에 보여줄 동적 컬럼. */
const extra = () =>
    jsonb("extra").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`);

/**
 * 1. cases — 가설이 1개 이상 붙은 case 의 snapshot.
 * review_target/review_point 와 FK 없음 (caseId = 외부 문자열 계약).
 * stockCode/tradeDate/tradeTime 은 caseId 에서 파생되는 값이지만 조회 편의를 위해 비정규화.
 * stockName 만이 caseId 로 못 구하는 외부 enrich 대상.
 * outcome 은 이 트레이드의 실제 결과(가설 무관). 느슨한 varchar — 허용값은 App(domain/outcome)이 고정.
 * note 는 케이스 자유 메모(가설 무관). 자유 텍스트라 길이 제한 없는 text.
 */
export const cases = hypothesisSchema.table("cases", {
    caseId: varchar("case_id", { length: 40 }).primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    stockName: varchar("stock_name", { length: 100 }),
    tradeDate: date("trade_date").notNull(),
    tradeTime: time("trade_time"), // nullable: HHmm 없는 groupId fallback 허용
    outcome: varchar("outcome", { length: 20 }), // nullable: 미설정. 허용값은 domain/outcome 가 고정.
    note: text("note"), // nullable: 케이스 자유 메모(가설 무관). 빈 문자열은 저장하지 않고 null.
    extra: extra(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * 2. hypotheses — 가설 원본.
 * 표시 코드(H1)는 저장하지 않고 id 에서 파생(`H` + id, 패딩 없음).
 * status 는 막지 않고 느슨하게(varchar): draft / active / archived ...
 */
export const hypotheses = hypothesisSchema.table("hypotheses", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    text: text("text").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    extra: extra(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * 3. tags — 태그 마스터.
 * 이름이 정체성, id 는 rename 흡수용.
 */
export const tags = hypothesisSchema.table(
    "tags",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        name: varchar("name", { length: 50 }).notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [unique("uq_tag_name").on(t.name)],
);

/**
 * 4. hypothesis_tags — 가설 ↔ 태그 N:M 순수 정션.
 */
export const hypothesisTags = hypothesisSchema.table(
    "hypothesis_tags",
    {
        hypothesisId: bigint("hypothesis_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        tagId: bigint("tag_id", { mode: "bigint" })
            .notNull()
            .references(() => tags.id, { onDelete: "cascade" }),
    },
    (t) => [primaryKey({ columns: [t.hypothesisId, t.tagId] })],
);

/**
 * 5. hypothesis_cases — 가설 ↔ case 연결 + note.
 * (트레이드 결과 outcome 은 케이스 레벨 cases.outcome 으로 이동했다.)
 */
export const hypothesisCases = hypothesisSchema.table(
    "hypothesis_cases",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        hypothesisId: bigint("hypothesis_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        caseId: varchar("case_id", { length: 40 })
            .notNull()
            .references(() => cases.caseId, { onDelete: "cascade" }),
        note: text("note"),
        extra: extra(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (t) => [
        unique("uq_hcase_hyp_case").on(t.hypothesisId, t.caseId),
        index("idx_hcase_case").on(t.caseId),
    ],
);

/**
 * 6. hypothesis_relations — 가설 그래프(트리 아님).
 * relationType: better_than / parent_of / similar_to / conflicts_with ...
 * 자기참조·순환은 DB 제약이 아니라 App 경고로 처리한다.
 */
export const hypothesisRelations = hypothesisSchema.table(
    "hypothesis_relations",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        fromHypothesisId: bigint("from_hypothesis_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        toHypothesisId: bigint("to_hypothesis_id", { mode: "bigint" })
            .notNull()
            .references(() => hypotheses.id, { onDelete: "cascade" }),
        relationType: varchar("relation_type", { length: 20 }).notNull(),
        note: text("note"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [
        unique("uq_rel_from_type_to").on(
            t.fromHypothesisId,
            t.relationType,
            t.toHypothesisId,
        ),
        index("idx_rel_to").on(t.toHypothesisId), // 역방향("나를 가리키는 관계") 조회용
    ],
);
