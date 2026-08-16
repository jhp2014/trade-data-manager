// infra/db/schema — `curation` Postgres 스키마: 사람이 편집/큐레이션하는 시장 주석.
// 수집/기계생성(candles·market_cap·news·stock_master = `market`)과 물리 격리. FK 없음(무결성은 앱이 관리).
// 편집 데이터의 기둥 셋:
//   · daily_comments : 당일 종목 코멘트((종목,날짜) 자연키 PK — 종목당 당일 1개)
//   · chart_anchors  : 차트 앵커 — 캔들 좌표 참조의 단일 테이블(가격선+파라미터 앵커 통합, 아래 9번)
//   · review_points  : 복기 타점((종목,날짜,시각) 자연키 = caseId. 순위 배치가 하류에서 참조)
// 분류의 두 갈래: rank_axes = 순서 있는 하나(아래 4~6번) / groups = 이름 붙인 집합 + 관계·위치(7~8번).
//   maps(9번)는 그룹들을 얹어 **그룹 사이의 구조**를 보는 평면이다.
//
// 수치 표현(잠금): 가격류는 integer(원 단가 int 안전). 도메인은 무손실 string 계약 → 매퍼 경계에서만 변환.
import { sql } from "drizzle-orm";
import { pgSchema, varchar, date, time, timestamp, text, bigint, bigserial, doublePrecision, primaryKey, foreignKey, unique, index, uniqueIndex } from "drizzle-orm/pg-core";

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
//    셋업 유형(옛 `type` varchar)은 그룹(아래 7·8번)로 이관 — 명목형은 한 타점에 여럿이라 단일 칸이 자리가 아니었다.
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
//    순서 자체가 없는 '종류'(테마 분류 등 명목형)는 축이 아니라 그룹으로 다룬다(여기 안 넣음).
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
        // 한 축에 같은 자리는 하나뿐 — **"slot 의 정체성은 자리다"라는 선언**.
        // 클라가 줄을 그릴 때 orderKey 가 같은 배치를 한 타이 묶음으로 접는데, 그게 참이라는 보장이
        // 없었다. 실제로 축 11 에 order_key=-1 인 slot 이 둘 있었다(하나는 배치 0건 유령 —
        // GC 가 놓친 것). surrogate id 가 있어서 "같은 자리인데 다른 것"이 성립할 수 있었던 자리다.
        // 마이그 0016 이 그 유령을 지우고 이 제약을 건다.
        unique("uq_rank_slot_position").on(t.axisId, t.orderKey),
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

// ── 그룹(named set) ─────────────────────────────────────────────────────────
// 축(rank_axes)이 "순서를 매길 수 있는 차원"이라면, 그룹은 **이름 붙인 집합**이다. 한 항목에 여럿 붙는다.
//
// 옛 태그가 이것이고, 여기에 **관계와 위치**가 붙어 그룹이 됐다. 태그로는 그룹 안 그룹도, 두 그룹이
// 얼마나 겹치는지(징검다리)도 볼 수가 없었다 — 관계를 담을 자리가 없었기 때문이다.
//   · parent_id  : 그룹 안 그룹(임의로 깊어진다 — 연속성을 좌표 대신 **계층의 깊이**로 표현한다)
//   · map_id·x·y : 어느 평면에 어디쯤 — **시각화용이지 데이터가 아니다**. 붙여 놓은 둘은 "닮았다"는
//                  주장이지만, 멀리 있는 둘은 "안 닮았다"가 아니라 **아직 아무 말도 안 한 것**이다.
//   · 징검다리   : 저장하지 않는다. 두 그룹의 **멤버 겹침으로 계산**된다(A·B 를 둘 다 가진 항목).

// 7. 그룹 — 이름이 곧 정체(unique). surrogate id 로 부착하므로 이름 변경이 부착을 안 깬다.
//    이름은 손잡이지 주장이 아니다("미정1" 로 지어도 된다) — 이름을 짓는 비용이 낮아야 잘게 쪼갤 수 있다.
//
//    ⚠ **scope 는 맵이 아니라 그룹이 든다**: 그룹은 한 층위에 대한 판단이지 맵에 올려야 비로소 그렇게
//    되는 게 아니다. 맵에서 내려받게 하면 map_id 가 NULL 인 그룹(= 만들었지만 아직 안 올린 정상 상태)의
//    grain 이 없어, 첫 부착이 암묵적으로 grain 을 정하게 된다. 맵에 올릴 때 maps.scope 와 일치하는지는
//    저장 경로가 한 줄로 검사한다.
export const groups = curation.table(
    "groups",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        name: text("name").notNull(),
        scope: varchar("scope", { length: 10 }).notNull(), // point | day — 멤버가 타점이냐 하루냐
        parentId: bigint("parent_id", { mode: "bigint" }), // NULL = 최상위
        mapId: bigint("map_id", { mode: "bigint" }), // NULL = 아직 어느 평면에도 안 올림
        x: doublePrecision("x"),
        y: doublePrecision("y"),
    },
    (t) => [
        unique("uq_group_name").on(t.name),
        // 부모는 **같은 맵 안**이어야 하고 순환하면 안 된다 — 둘 다 DB 로는 못 막아 저장 경로가 본다.
        foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: "fk_group_parent" }).onDelete("set null"),
        index("idx_groups_map").on(t.mapId),
    ],
);

// 8. 그룹 멤버 — 옛 review_point_tags(타점)와 chart_tags(차트)를 **한 테이블로** 합쳤다.
//    갈라 둘 이유가 없었다: 같은 "이 그룹에 이게 들었다"이고, 다른 건 가리키는 층위뿐이다.
//
//    **소유 grain 은 trade_time 유무가 말한다**(chart_anchors·map 자리와 같은 관용구): NULL = 하루 소속 /
//    값 = 타점 소속. groups.scope 와 일치해야 하며 그 검사는 저장 경로가 한다.
//
//    ⚠ **review_points 복합 FK 는 MATCH SIMPLE(Postgres 기본)** — 참조 컬럼 중 하나라도 NULL 이면 검사를
//    건너뛴다. 그래서 한 테이블에서 조건부로 걸린다: **하루 멤버십(time NULL)은 타점이 없어도 통과**하고
//    (골격만 그려둔 하루도 분류 대상), **타점 멤버십은 타점이 죽으면 같이 죽는다**. 이 비대칭은 컬럼만
//    봐서는 안 보이므로 지우지 말 것.
//
//    ⚠ **PK 에는 NULL 을 못 넣는다** → 대리키 + **grain 별 부분 유니크 인덱스 둘**로 멱등 부착을 지킨다.
//    (PG15+ 의 UNIQUE NULLS NOT DISTINCT 로도 되지만, 부분 인덱스가 두 grain 을 스키마에서 눈으로 읽히게 한다.)
export const groupMembers = curation.table(
    "group_members",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        groupId: bigint("group_id", { mode: "bigint" })
            .notNull()
            .references(() => groups.id, { onDelete: "cascade" }),
        stockCode: varchar("stock_code", { length: 10 }).notNull(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time"), // NULL = 하루 소속(scope day) / 값 = 타점 소속(scope point)
    },
    (t) => [
        foreignKey({
            columns: [t.stockCode, t.tradeDate, t.tradeTime],
            foreignColumns: [reviewPoints.stockCode, reviewPoints.tradeDate, reviewPoints.tradeTime],
            name: "fk_group_member_review_point",
        }).onDelete("cascade"),
        // 멱등 부착 — grain 별로 나눠 건다(PK 를 못 쓰는 대신). NULL 을 유니크 키에 넣을 수 없으니
        // "시각 없는 행끼리"와 "시각 있는 행끼리"를 따로 잠근다.
        uniqueIndex("uq_group_member_day")
            .on(t.groupId, t.stockCode, t.tradeDate)
            .where(sql`${t.tradeTime} IS NULL`),
        uniqueIndex("uq_group_member_point")
            .on(t.groupId, t.stockCode, t.tradeDate, t.tradeTime)
            .where(sql`${t.tradeTime} IS NOT NULL`),
        index("idx_group_members_group").on(t.groupId), // "이 그룹 몇 건인가"(팔레트 빈도·삭제 확인)
        index("idx_group_members_item").on(t.stockCode, t.tradeDate), // "이 항목이 든 그룹들"(차트·시트)
    ],
);

export type GroupMemberRow = typeof groupMembers.$inferSelect;
export type GroupMemberInsert = typeof groupMembers.$inferInsert;

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
        // 자연키 유니크 — 좌표가 전부 같은 행은 하나뿐. **id 는 손잡이일 뿐 정체성이 아니다**(API 는 이 튜플로 지목).
        //
        // 예전에 이 방어를 저장 경로(repository add 의 조회→삽입)로 옮겼던 건, 4컬럼이 NULL 허용이라
        // 평범한 UNIQUE 가 무력했기 때문이다(SQL 기본값에서 NULL 은 서로 다르다 → 중복이 그냥 들어온다).
        // PG15 의 NULLS NOT DISTINCT 가 그 전제를 깬다 — NULL 끼리 같게 봐서 진짜로 잠긴다(양쪽 다 PG17).
        //
        // 저장 경로의 멱등은 그대로 둔다(왕복 절약). 이건 그 아래 최종 방어선이다:
        // 협업으로 **쓰는 프로세스가 둘**이 된 순간 "조회 후 없으면 삽입"은 둘 다 못 찾고 둘 다 넣는다.
        // 원자적으로 막을 수 있는 층은 DB 뿐이고, 읽기가 로컬 미러라 상대 작업이 안 보여 확률도 올라간다.
        unique("uq_chart_anchor_identity")
            .on(t.stockCode, t.tradeDate, t.tradeTime, t.param, t.anchorDate, t.anchorTime, t.field, t.market)
            .nullsNotDistinct(),
    ],
);

export type ChartAnchorRow = typeof chartAnchors.$inferSelect;
export type ChartAnchorInsert = typeof chartAnchors.$inferInsert;

// (옛 point_anchors 는 chart_anchors 로 흡수 후 드롭 — 마이그 0008 이관·0009 드롭.)

export type GroupRow = typeof groups.$inferSelect;
export type GroupInsert = typeof groups.$inferInsert;

export type RankAxisRow = typeof rankAxes.$inferSelect;
export type RankAxisInsert = typeof rankAxes.$inferInsert;
export type RankSlotRow = typeof rankSlots.$inferSelect;
export type RankSlotInsert = typeof rankSlots.$inferInsert;
export type RankPlacementRow = typeof rankPlacements.$inferSelect;
export type RankPlacementInsert = typeof rankPlacements.$inferInsert;

// ── 유사도 맵 ───────────────────────────────────────────────────────────────
// 축이 없는 2차원 평면. **점은 항목이 아니라 그룹이다**(위 7번) — 종목 수천 개를 흩뿌리면 모든 쌍 사이에
// 거리가 생기는데, 실제로 주장하려던 건 일부 이웃 관계뿐이라 나머지는 나중에 의미로 오독되는 부산물이다.
// 묶고 쪼개는 판단은 골격 패널에서 하고, 이 평면은 **그룹 사이의 구조를 보는 곳**이다:
// 그룹 안 그룹(groups.parent_id) · 겹침으로 계산되는 징검다리 · 손으로 잡아 둔 대략의 자리.

// 9. 맵 — 한 장의 평면. scope 는 이 평면에 올릴 수 있는 그룹의 층위(그룹도 같은 값을 들고, 저장 경로가 대조).
//    좌표·부모는 그룹이 들고 있으므로(groups.map_id·x·y) 여긴 평면의 정체만 남는다.
export const maps = curation.table(
    "maps",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        name: text("name").notNull(),
        scope: varchar("scope", { length: 10 }).notNull(), // point | day
    },
    (t) => [unique("uq_map_name").on(t.name)],
);

export type MapRow = typeof maps.$inferSelect;
export type MapInsert = typeof maps.$inferInsert;

// (옛 map_placements·map_groups·tags·review_point_tags·chart_tags 는 마이그 0014 에서 드롭.
//  항목 단위 자리는 "점 = 그룹" 으로 바뀌며 쓸 데가 없어졌고, map_groups 는 그룹이 map_id 를 직접
//  들면서 아무도 안 쓰는 조인 자유도가 됐다.)
