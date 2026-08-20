// 큐레이션 존재 지도 — "이 (종목,날짜)에 어떤 수동 데이터가 있나"를 종류별 개수로 접은 read model.
//
// 재료는 큐레이션 복제본의 테이블 4개(앵커·타점·그룹 멤버십·코멘트) 전량이고, 여긴 **순수 접기**만 있다
// (fetch·훅은 usePresence.ts — 포트/구현 분리로 소비자는 재료가 복제본인지 서버 조회인지 모른다).
// 작업셋 목록의 모수·배지·필터 칩·차트 헤더 배지가 전부 이 한 지도를 본다.
//
// **모수 = curation 흔적이 있는 날 전부** — 옛 작업셋(기준선 ∪ 타점)이 놓치던 "골격만 찍은 날"·
// "그룹만 담은 날"·"코멘트만 남긴 날"이 다 올라온다. 걸러 보는 건 필터 칩(3상·AND)의 몫이다.
// 서버 candidate_days(분석 모수)와 같은 합집합 개념이지만 정의는 각자 소유 — 한 리드모델로 두 소비자를
// 섬기면 경계 차이(코멘트 유무 등)가 플래그로 자라서, union 한 줄의 중복을 수용했다.
import { ANCHOR_PARAMS, BASELINE_PARAM, IGNORE_CANDLE_PARAM, SKELETON_MINUTE_PARAM, SKELETON_PARAM } from "@trade-data-manager/market/domain";
import type { ChartAnchor, DailyCommentListItem, GroupMembership, ReviewPointListItem } from "@trade-data-manager/wire";
import { chartKeyOf } from "./pointKey.js";
import { ACTIVE, GROUP_PLAIN, IGNORED_CANDLE, PRICE_LINE, SKELETON } from "../styles/palette.js";

/** 한 (종목,날짜)의 큐레이션 존재 요약 — 유무·개수만(상세는 각 도메인 쿼리가 소유). */
export interface DayPresence {
    stockCode: string;
    date: string; // YYYY-MM-DD
    /** 앵커 param key → 개수. 없는 param 은 키 없음(0). */
    marks: ReadonlyMap<string, number>;
    /** 복기 타점 수. */
    points: number;
    /** 이 날에 걸린 그룹 이름들(하루 직접 ∪ 타점 직접, dedupe) — "그룹만 담은 날"도 여기로 잡힌다. */
    groups: readonly string[];
    comment: boolean;
}

/**
 * 존재 종류 레지스트리 — 배지·필터 칩이 같은 목록을 돈다(종류 추가 = 여기 한 줄).
 * 앵커 4종은 ANCHOR_PARAMS 에서 파생 — param 이 늘면 배지·칩이 자동으로 따라온다.
 */
export interface PresenceKindDef {
    key: string; // 앵커는 param key, 나머지는 point/group/comment
    name: string;
    /** 배지 색 — palette 의 같은 개념 색을 재사용(차트의 선·골격·무시 마커와 같은 색이라 눈이 잇는다). */
    color: string;
    countOf: (p: DayPresence) => number;
}

// 배지 색 — 차트가 그 종류를 그리는 색과 같게 잡는다(선=청록, 골격 둘=황록, 무시=회색).
// 분봉 골격이 일봉 골격과 **같은 색**인 것도 차트를 따른 것이다 — 배지에서는 아이콘(실선/파선)이 가른다.
const ANCHOR_COLORS: Record<string, string> = {
    [BASELINE_PARAM]: PRICE_LINE,
    [IGNORE_CANDLE_PARAM]: IGNORED_CANDLE,
    [SKELETON_PARAM]: SKELETON,
    [SKELETON_MINUTE_PARAM]: SKELETON,
};

export const PRESENCE_KINDS: readonly PresenceKindDef[] = [
    ...ANCHOR_PARAMS.map((p) => ({
        key: p.key,
        name: p.name,
        color: ANCHOR_COLORS[p.key] ?? "var(--text-secondary)",
        countOf: (d: DayPresence) => d.marks.get(p.key) ?? 0,
    })),
    { key: "point", name: "타점", color: ACTIVE, countOf: (d) => d.points },
    { key: "group", name: "그룹", color: GROUP_PLAIN, countOf: (d) => d.groups.length },
    { key: "comment", name: "코멘트", color: "var(--text-secondary)", countOf: (d) => (d.comment ? 1 : 0) },
];

/** 테이블 4개 → chartKey("code|date") → DayPresence. 재료 어느 쪽에든 흔적이 있으면 항목이 생긴다. */
export function buildPresenceIndex(
    anchors: readonly ChartAnchor[],
    points: readonly Pick<ReviewPointListItem, "stockCode" | "date">[],
    memberships: readonly GroupMembership[],
    comments: readonly Pick<DailyCommentListItem, "stockCode" | "date">[],
): Map<string, DayPresence> {
    const idx = new Map<string, { stockCode: string; date: string; marks: Map<string, number>; points: number; groups: Set<string>; comment: boolean }>();
    const ensure = (stockCode: string, date: string) => {
        const k = chartKeyOf(stockCode, date);
        let e = idx.get(k);
        if (!e) {
            e = { stockCode, date, marks: new Map(), points: 0, groups: new Set(), comment: false };
            idx.set(k, e);
        }
        return e;
    };
    // 앵커 — param 무관 전부(타점 소유 행도 그 차트의 흔적이다).
    for (const a of anchors) {
        const e = ensure(a.stockCode, a.date);
        e.marks.set(a.param, (e.marks.get(a.param) ?? 0) + 1);
    }
    for (const p of points) ensure(p.stockCode, p.date).points += 1;
    // 멤버십 — 하루 소속·타점 소속 둘 다 그 날의 그룹 흔적으로 합산(dedupe). 필터 "그룹 있음"이
    // 타점에만 붙인 그룹도 잡아야 "후보로 담아놓고 아직 안 본 날" 질문이 성립한다.
    for (const m of memberships) {
        const e = ensure(m.stockCode, m.date);
        for (const name of m.groupNames) e.groups.add(name);
    }
    for (const c of comments) ensure(c.stockCode, c.date).comment = true;

    const out = new Map<string, DayPresence>();
    for (const [k, e] of idx) out.set(k, { ...e, groups: [...e.groups].sort((a, b) => a.localeCompare(b)) });
    return out;
}

// ── 필터(DNF: 절 안 AND × 절 사이 OR) ────────────────────────────────────────
// 알람 조건과 같은 어휘를 쓴다(leaf 는 AND, OR 는 조건을 하나 더) — 이 프로젝트에서 이미 검증된 결합 모델이라
// 새 표현식 빌더를 만들지 않는다. 절 하나 = 3상 칩들의 AND, 절이 여러 개면 그중 하나만 맞아도 통과.

/** 종류 하나의 필터 상태 — 있는 날만 / 없는 날만. 절 안에서 칩 클릭이 has → not → 제거로 순환한다. */
export type TriState = "any" | "has" | "not";

/** 절(clause) — kind key → 상태. 안 적힌 키는 "any"(무관). */
export type PresenceFilter = Readonly<Record<string, TriState>>;

/** 절 목록 = 필터 전체. 빈 목록 = 필터 없음. */
export type PresenceDnf = readonly PresenceFilter[];

/** 절 하나의 AND — "골격 있음 ∧ 타점 없음" 같은 질문. */
export function matchesPresence(d: DayPresence, filter: PresenceFilter): boolean {
    for (const kind of PRESENCE_KINDS) {
        const st = filter[kind.key] ?? "any";
        if (st === "any") continue;
        const n = kind.countOf(d);
        if (st === "has" ? n === 0 : n > 0) return false;
    }
    return true;
}

/** 이 절에 활성 칩이 있나 — **빈 절은 평가에서 제외**된다(빈 절 = 전부 통과라 OR 전체를 무력화하므로). */
export const hasActiveFilter = (filter: PresenceFilter): boolean => PRESENCE_KINDS.some((k) => (filter[k.key] ?? "any") !== "any");

/** 절들의 OR — 활성 절이 하나도 없으면 전부 통과(필터 없음). */
export function matchesPresenceDnf(d: DayPresence, dnf: PresenceDnf): boolean {
    const active = dnf.filter(hasActiveFilter);
    if (active.length === 0) return true;
    return active.some((clause) => matchesPresence(d, clause));
}

/** DNF 에 활성 절이 있나 — "숨김 N" 표기·해제 손잡이의 기준. */
export const hasActiveDnf = (dnf: PresenceDnf): boolean => dnf.some(hasActiveFilter);

/** 절 안 칩 클릭 순환: has → not → any(제거). 새 칩은 has 로 들어온다. */
export const nextTriState = (s: TriState): TriState => (s === "any" ? "has" : s === "has" ? "not" : "any");

/**
 * 영속 복원 — 아는 상태값만 살린다(깨진 저장값이 "전부 숨김"으로 오독되면 안 된다).
 * 옛 형식(절 하나짜리 Record)은 절 목록 [절] 로 감싸 무손실 승계한다 — usePersistedState 는 다시
 * 저장할 때까지 옛 값을 그대로 두므로 이 변환은 일회성 이관이 아니라 읽기 규칙이다(setRef 선례).
 */
export function parsePresenceDnf(raw: unknown): PresenceDnf | null {
    const parseClause = (o: unknown): PresenceFilter | null => {
        if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
        const out: Record<string, TriState> = {};
        for (const [k, v] of Object.entries(o)) if (v === "has" || v === "not") out[k] = v;
        return out;
    };
    if (Array.isArray(raw)) {
        const clauses = raw.map(parseClause).filter((c): c is PresenceFilter => c !== null);
        return clauses;
    }
    const single = parseClause(raw);
    return single === null ? null : Object.keys(single).length > 0 ? [single] : [];
}
