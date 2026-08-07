// infra/db/schema — `curation` Postgres 스키마: 사람이 편집/큐레이션하는 시장 주석.
// 수집/기계생성(candles·market_cap·news·stock_master = `market`)과 물리 격리. FK 없음(무결성은 앱이 관리).
// 편집 데이터의 기둥 셋:
//   · daily_comments : 당일 종목 코멘트((종목,날짜) 자연키 PK — 종목당 당일 1개)
//   · chart_anchors  : 차트 앵커 — 캔들 좌표 참조의 단일 테이블(가격선+파라미터 앵커 통합, 아래 9번)
//   · review_points  : 복기 타점((종목,날짜,시각) 자연키 = caseId. 순위 배치가 하류에서 참조)
//
// 수치 표현(잠금): 가격류는 integer(원 단가 int 안전). 도메인은 무손실 string 계약 → 매퍼 경계에서만 변환.
import { pgSchema, varchar, date, time, timestamp, text, bigint, bigserial, doublePrecision, primaryKey, foreignKey, unique, index } from "drizzle-orm/pg-core";

export const curation = pgSchema("curation");

// 1. 당일 종목 코멘트 — 사람이 큐레이션하는 편집 데이터(원시수집 아님). "이 날, 이 종목에 남긴 메모".
//    종목의 정적 테마(=정체성)는 Google Sheet(종목 History)에 있고, 여긴 당일 종목별 자유 주석만 담는다.
//    (trade_date, stock_code) 자연키 PK = 종목당 당일 코멘트 1개. FK 없음(자연키 조인은 trade_date·stock_code).
//    편집모델: comment 가 키 밖이라 갱신 가능 → upsert(review_points.memo 선례). 빈 코멘트 = 행 삭제(빈 행 없음).
//    author = 입력자(누가 남겼나 보존). created_at/updated_at 은 부기.
export const dailyComments = curation.table(
    "daily_comments",
    {
        tradeDate: date("trade_date").notNull(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        comment: text("comment").notNull(),
        author: varchar("author", { length: 50 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.tradeDate, t.stockCode] }),
        index("idx_daily_comments_stock").on(t.stockCode),
    ],
);

// 2. (옛 price_lines 는 chart_anchors 로 흡수 후 드롭 — 마이그 0008 이관·0009 드롭.)

// 3. 복기 타점 — 차트에서 찍은 타점. 자연키 (stockCode, tradeDate, tradeTime) 삼중키(시각 필수).
//    **옛 case 를 흡수** = 이 타점이 곧 case. outcome(트레이드 결과)·memo 는 타점 자체 속성.
//    셋업 유형(옛 `type` varchar)은 태그(아래 7·8번)로 이관 — 명목형은 한 타점에 여럿이라 단일 칸이 자리가 아니었다.
//    순위 배치(rank_placements)가 이 자연키를 하류에서 참조. PK 가 (stock,date) prefix 커버 → listByChart 별도 인덱스 불필요.
export const reviewPoints = curation.table(
    "review_points",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        outcome: varchar("outcome", { length: 20 }), // 트레이드 결과(선택). 허용값은 클라.
        memo: text("memo"),
    },
    (t) => [primaryKey({ columns: [t.stockCode, t.tradeDate, t.tradeTime] })],
);

export type DailyCommentRow = typeof dailyComments.$inferSelect;
export type DailyCommentInsert = typeof dailyComments.$inferInsert;
export type ReviewPointRow = typeof reviewPoints.$inferSelect;
export type ReviewPointInsert = typeof reviewPoints.$inferInsert;

// ── 순위 배치(ordinal placement) ────────────────────────────────────────────
// 점수를 매기지 않고, 각 비교 차원(축)마다 기존 타점들이 늘어선 '줄' 위에서 상대 위치만 정한다.
// 위치(백분위)는 저장 순간의 절대점수가 아니라 데이터에 대한 상대 순서 → 기준 드리프트에 강함.
// 검색은 "A 타점보다 위·B 타점보다 아래"처럼 참조 타점으로 경계를 잡아 축마다 AND. outcome 은 reviewPoint 가 이미 보유.

// 4. 순위 축(rank axis) — 순서를 매길 수 있는 하나의 비교 차원(일봉-형태, 테마, 거래대금, 끼 …). 앱에서 CRUD.
//    원칙: 한 축 = "일관되게 상하 순서를 매길 수 있는 하나". 순서를 못 매기겠으면 두 축이 엉킨 신호 → 분리.
//    순서 자체가 없는 '종류'(테마 분류 등 명목형)는 축이 아니라 태그로 다룬다(여기 안 넣음).
export const rankAxes = curation.table(
    "rank_axes",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        name: text("name").notNull(),
        // 배치 단위(grain). point=(종목·날짜·시각) 타점별 / day=(종목·날짜) 하루 일관(place 시 그날 전 타점에 fanout).
        // 저장은 언제나 실재 타점(placement 무변경) — day 는 "쓰기 확장" 편의일 뿐, 읽기(줄)는 point 와 동일.
        scope: varchar("scope", { length: 10 }).notNull().default("point"),
    },
    (t) => [unique("uq_rank_axis_name").on(t.name)],
);

// 5. 슬롯(slot) — 한 축의 줄 위 한 '위치'. order_key 로 정렬. 사이 삽입 = 두 이웃 order_key 의 중간값
//    (같은 틈에 반복 삽입해 double 정밀도가 바닥나면 그 축만 order_key 재부여=reindex).
//    타이(같은 순위) = 여러 placement 가 한 slot 을 공유 → slot 이 유일한 키를 든다(재정렬해도 타이 안 깨짐).
//    unique(axis_id, id) = placement 의 (axis_id, slot_id) 복합 FK 대상. slot 이 선언된 축과 다른 축에 꽂히는
//    모순을 DB 가 차단(앱 검증 불필요).
export const rankSlots = curation.table(
    "rank_slots",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        axisId: bigint("axis_id", { mode: "bigint" })
            .notNull()
            .references(() => rankAxes.id, { onDelete: "cascade" }),
        orderKey: doublePrecision("order_key").notNull(),
    },
    (t) => [
        unique("uq_rank_slot_axis_id").on(t.axisId, t.id),
        index("idx_rank_slots_axis_order").on(t.axisId, t.orderKey),
    ],
);

// 6. 배치(placement) — 한 복기 타점(reviewPoint)을 한 축의 한 slot 에 꽂음. situation = reviewPoint 재사용.
//     PK (stock,date,time,axis) = "한 타점은 한 축에 최대 한 번"(=한 slot). reviewPoint 삼중키로 FK(cascade).
//     (axis_id, slot_id) 복합 FK → rank_slots(axis_id, id): slot 의 축 == placement 의 축을 DB 가 보장.
//     축 삭제 → slot cascade → placement cascade / 타점 삭제 → placement cascade.
export const rankPlacements = curation.table(
    "rank_placements",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        axisId: bigint("axis_id", { mode: "bigint" }).notNull(),
        slotId: bigint("slot_id", { mode: "bigint" }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.stockCode, t.tradeDate, t.tradeTime, t.axisId] }),
        foreignKey({
            columns: [t.stockCode, t.tradeDate, t.tradeTime],
            foreignColumns: [reviewPoints.stockCode, reviewPoints.tradeDate, reviewPoints.tradeTime],
            name: "fk_rank_placement_review_point",
        }).onDelete("cascade"),
        foreignKey({
            columns: [t.axisId, t.slotId],
            foreignColumns: [rankSlots.axisId, rankSlots.id],
            name: "fk_rank_placement_slot",
        }).onDelete("cascade"),
        index("idx_rank_placements_slot").on(t.slotId),
    ],
);

// ── 태그(nominal tag) ───────────────────────────────────────────────────────
// 축(rank_axes)이 "순서를 매길 수 있는 차원"이라면, 태그는 **순서 없는 종류**다(위 4번 주석의 예고 이행).
// 셋업 유형처럼 상하가 없는 분류를 축의 배치 유무로 대신 표현하던 우회를 걷어내고 제자리에 둔다.
// review_points.type(단일 varchar)이 하던 일을 흡수 — 태그는 한 타점에 여러 개 붙는다(그게 원래 성질).

// 7. 태그 사전 — 이름이 곧 정체(unique). surrogate id 로 부착하므로 이름 변경이 부착을 안 깬다.
//    이름의 `그룹:값` 은 관례일 뿐 스키마가 강제하지 않는다(표시 색 그룹핑용). 배타 그룹은 아직 없음.
export const tags = curation.table(
    "tags",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        name: text("name").notNull(),
    },
    (t) => [unique("uq_tag_name").on(t.name)],
);

// 8. 태그 부착 — 타점 ↔ 태그 N:M 정션. PK (stock,date,time,tag_id) = "한 타점에 같은 태그는 한 번"(멱등 부착).
//    review_points 삼중키 FK(cascade) = 타점을 지우면 부착도 사라짐 / tags FK(cascade) = 태그를 지우면 전부 떨어짐.
//    index(tag_id) = "이 태그 몇 건인가"(삭제 확인·팔레트 빈도)를 정션 스캔 없이.
export const reviewPointTags = curation.table(
    "review_point_tags",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        tagId: bigint("tag_id", { mode: "bigint" }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.stockCode, t.tradeDate, t.tradeTime, t.tagId] }),
        foreignKey({
            columns: [t.stockCode, t.tradeDate, t.tradeTime],
            foreignColumns: [reviewPoints.stockCode, reviewPoints.tradeDate, reviewPoints.tradeTime],
            name: "fk_review_point_tag_point",
        }).onDelete("cascade"),
        foreignKey({
            columns: [t.tagId],
            foreignColumns: [tags.id],
            name: "fk_review_point_tag_tag",
        }).onDelete("cascade"),
        index("idx_review_point_tags_tag").on(t.tagId),
    ],
);

// 8b. 차트 태그 부착 — **차트(종목,날짜) ↔ 태그** 정션. 골격으로 상황을 분류할 때(타점 없는 차트도 대상).
//     사전(tags)은 타점 부착과 공유 — 분류가 타점용/차트용으로 갈라질 이유가 없다.
//     review_points FK 가 **없다**(chart_anchors 선례): 차트는 행이 아니고, 태그는 타점보다 오래 산다.
//     PK (stock,date,tag_id) = 멱등 부착. tags FK cascade = 태그 삭제 시 부착도 제거.
export const chartTags = curation.table(
    "chart_tags",
    {
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tagId: bigint("tag_id", { mode: "bigint" }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.stockCode, t.tradeDate, t.tagId] }),
        foreignKey({
            columns: [t.tagId],
            foreignColumns: [tags.id],
            name: "fk_chart_tag_tag",
        }).onDelete("cascade"),
        index("idx_chart_tags_tag").on(t.tagId),
    ],
);

export type ChartTagRow = typeof chartTags.$inferSelect;
export type ChartTagInsert = typeof chartTags.$inferInsert;

// ── 차트 앵커 ───────────────────────────────────────────────────────────────
// 9. 차트 앵커 — 캔들 좌표 참조의 **단일 테이블**. 옛 price_lines(가격선)와 point_anchors(타점 파라미터 앵커)를
//    흡수했다: 가격선 = param 'baseline' 인 앵커(선 = 곧 기준선 후보), 무시 캔들 등 다른 param 도 같은 모양.
//
//    **소유 grain 은 trade_time 유무가 말한다**: NULL = 차트(종목,날짜) 소유 / 값 = 타점 소유(예약 —
//    현재 레지스트리의 param 은 전부 chart 소유라 시각이 들어오면 저장 경로가 거부한다. AnchorParamDef.owner).
//    anchor_time 도 같은 관용구: NULL = 일봉 앵커 / 값 = 분봉 앵커(이때 market 은 'un' 고정 — 분봉 KRX 는
//    세션 부재(NXT 단독 시간대)가 있어 앵커로 쓸 수 없다. 저장 경로 규칙).
//
//    **가격이 아니라 좌표를 저장**한다(옛 두 테이블과 동일): 값은 읽기 시점에 그 캔들에서 읽으므로 수정계수가
//    바뀌어도 자동으로 따라간다. field·market 은 **한 쌍**: 둘 다 있으면 가격 앵커(사람이 시장·값까지 지목 —
//    KRX/UN 고가가 다르거나 NXT 오염 캔들을 피하는 판단), 둘 다 없으면 시각 앵커(값은 축이 정한다).
//
//    **surrogate id 인 이유**: 같은 캔들에 뜻이 다른 행이 여럿 정당하다(가격선 성질을 흡수). 같은 좌표 중복은
//    DB 가 아니라 저장 경로가 막는다(옛 자연키 유니크의 방어 이관). FK 없음 — 기준선은 타점보다 오래 산다
//    (타점을 지워도 차트의 선은 남는 게 올바른 생명주기). param 은 코드 레지스트리 키(domain/review/chartAnchor.ts).
//
//    index(stock,date) = "이 차트의 앵커들" 로드용 / index(param,date) = 작업셋 목록·보드 원 표시(param 필터 집계).
export const chartAnchors = curation.table(
    "chart_anchors",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(), // 소유 차트의 거래일
        tradeTime: time("trade_time"), // NULL=차트 소유 / 값=타점 소유(예약 — AnchorParamDef.owner 가 게이트)
        param: varchar("param", { length: 40 }).notNull(),
        anchorDate: date("anchor_date").notNull(), // 가리키는 캔들의 거래일
        anchorTime: time("anchor_time"), // NULL=일봉 앵커 / 값=분봉 앵커(market='un' 고정)
        field: varchar("field", { length: 5 }), // high|low|open|close — market 과 한 쌍
        market: varchar("market", { length: 3 }), // krx|un
    },
    (t) => [
        index("idx_chart_anchors_chart").on(t.stockCode, t.tradeDate),
        index("idx_chart_anchors_param").on(t.param, t.tradeDate),
    ],
);

export type ChartAnchorRow = typeof chartAnchors.$inferSelect;
export type ChartAnchorInsert = typeof chartAnchors.$inferInsert;

// (옛 point_anchors 는 chart_anchors 로 흡수 후 드롭 — 마이그 0008 이관·0009 드롭.)

export type TagRow = typeof tags.$inferSelect;
export type TagInsert = typeof tags.$inferInsert;
export type ReviewPointTagRow = typeof reviewPointTags.$inferSelect;
export type ReviewPointTagInsert = typeof reviewPointTags.$inferInsert;

export type RankAxisRow = typeof rankAxes.$inferSelect;
export type RankAxisInsert = typeof rankAxes.$inferInsert;
export type RankSlotRow = typeof rankSlots.$inferSelect;
export type RankSlotInsert = typeof rankSlots.$inferInsert;
export type RankPlacementRow = typeof rankPlacements.$inferSelect;
export type RankPlacementInsert = typeof rankPlacements.$inferInsert;
