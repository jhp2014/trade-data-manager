// 큐레이션 존재 지도 — "이 (종목,날짜)에 어떤 수동 데이터가 있나"를 종류별 개수로 접은 read model.
//
// 재료는 큐레이션 복제본의 테이블 4개(앵커·타점·그룹 멤버십·코멘트) 전량이고, 여긴 **순수 접기**만 있다
// (fetch·훅은 usePresence.ts — 포트/구현 분리로 소비자는 재료가 복제본인지 서버 조회인지 모른다).
// 작업셋 목록의 모수·배지·필터 칩·차트 헤더 배지가 전부 이 한 지도를 본다.
//
// **모수 = curation 흔적이 있는 날 전부** — 옛 작업셋(기준선 ∪ 타점)이 놓치던 "그룹만 담은 날"·
// "코멘트만 남긴 날"이 다 올라온다. 걸러 보는 건 필터 칩(3상·AND)의 몫이다.
// 후보 하루(분석 모수)도 이 지도의 파생이다(candidateDaysOf — 경계 차이는 코멘트 하나뿐이라 필터 한 줄).
// 옛 서버 union(GET /candidate-days)은 이 파생이 흡수하며 은퇴 — 정의가 여기 한 곳이 됐다.
import { ANCHOR_PARAMS, BASELINE_PARAM, IGNORE_CANDLE_PARAM } from "@trade-data-manager/market/domain";
import type { ChartAnchor, DailyCommentListItem, GroupMembership, ReviewPoint } from "@trade-data-manager/wire";
import { isDayMembership } from "./groupIndex.js";
import { chartKeyOf } from "./pointKey.js";
import { ACTIVE, GROUP_PLAIN, IGNORED_CANDLE, PRICE_LINE } from "../styles/palette.js";

/** 한 (종목,날짜)의 큐레이션 존재 요약 — 유무·개수만(상세는 각 도메인 쿼리가 소유). */
export interface DayPresence {
    stockCode: string;
    date: string; // YYYY-MM-DD
    /** 앵커 param key → 개수. 없는 param 은 키 없음(0). */
    marks: ReadonlyMap<string, number>;
    /** 복기 타점 수. */
    points: number;
    /**
     * 이 날의 그룹 이름들 — **층위로 나눠 든다**(하루 소속 / 타점 소속, 각각 dedupe·이름순).
     * 합쳐 두면 "그룹 없는 날"이 층위를 못 가린다: 일봉에서 하루 그룹을 배정한 날은 타점을 하나도
     * 분류 안 했어도 "그룹 있음"이 되어, 분봉 작업 대상을 고르는 질문이 통째로 무너진다
     * (필터 깔때기의 "…그룹 없음" 리터럴이 층위를 갖게 된 것과 같은 이유).
     */
    dayGroups: readonly string[];
    pointGroups: readonly string[];
    comment: boolean;
}

/**
 * 존재 종류 레지스트리 — 배지·필터 칩이 같은 목록을 돈다(종류 추가 = 여기 한 줄).
 * 앵커 4종은 ANCHOR_PARAMS 에서 파생 — param 이 늘면 배지·칩이 자동으로 따라온다.
 */
export interface PresenceKindDef {
    key: string; // 앵커는 param key, 나머지는 point/group-day/group-point/comment
    name: string;
    /** 배지 색 — palette 의 같은 개념 색을 재사용(차트의 선·무시 마커와 같은 색이라 눈이 잇는다). */
    color: string;
    countOf: (p: DayPresence) => number;
    /**
     * 개수 말고 **이름들**을 가진 종류(그룹 둘) — 배지가 hover 카드로 보여준다.
     * 종류가 아니라 레지스트리가 이걸 말해야 배지 코드에 "그룹이면"이라는 분기가 안 남는다.
     */
    namesOf?: (p: DayPresence) => readonly string[];
}

// 배지 색 — 차트가 그 종류를 그리는 색과 같게 잡는다(선=청록, 무시=회색).
const ANCHOR_COLORS: Record<string, string> = {
    [BASELINE_PARAM]: PRICE_LINE,
    [IGNORE_CANDLE_PARAM]: IGNORED_CANDLE,
};

export const PRESENCE_KINDS: readonly PresenceKindDef[] = [
    ...ANCHOR_PARAMS.map((p) => ({
        key: p.key,
        name: p.name,
        color: ANCHOR_COLORS[p.key] ?? "var(--text-secondary)",
        countOf: (d: DayPresence) => d.marks.get(p.key) ?? 0,
    })),
    { key: "point", name: "타점", color: ACTIVE, countOf: (d) => d.points },
    // 그룹은 **두 종류**다 — 하루에 건 것과 타점에 건 것은 다른 작업이라 한 칩으로 물으면 답이 섞인다.
    { key: "group-day", name: "하루 그룹", color: GROUP_PLAIN, countOf: (d) => d.dayGroups.length, namesOf: (d) => d.dayGroups },
    { key: "group-point", name: "타점 그룹", color: GROUP_PLAIN, countOf: (d) => d.pointGroups.length, namesOf: (d) => d.pointGroups },
    { key: "comment", name: "코멘트", color: "var(--text-secondary)", countOf: (d) => (d.comment ? 1 : 0) },
];

const EMPTY_MARKS: ReadonlyMap<string, number> = new Map();
const EMPTY_NAMES: readonly string[] = [];

/**
 * 흔적이 하나도 없는 날 — 지도에 없는 날을 필터에 걸 때의 값("!선"은 통과, "선"은 탈락).
 * 여기 있는 이유: 종류가 늘 때 이 빈 값도 같이 늘어야 하는데, 소비자가 제 손으로 만들면 한 곳이 빠진다.
 */
export const emptyPresence = (stockCode: string, date: string): DayPresence =>
    ({ stockCode, date, marks: EMPTY_MARKS, points: 0, dayGroups: EMPTY_NAMES, pointGroups: EMPTY_NAMES, comment: false });

/** 테이블 4개 → chartKey("code|date") → DayPresence. 재료 어느 쪽에든 흔적이 있으면 항목이 생긴다. */
export function buildPresenceIndex(
    anchors: readonly ChartAnchor[],
    points: readonly Pick<ReviewPoint, "stockCode" | "date">[],
    memberships: readonly GroupMembership[],
    comments: readonly Pick<DailyCommentListItem, "stockCode" | "date">[],
): Map<string, DayPresence> {
    const idx = new Map<string, { stockCode: string; date: string; marks: Map<string, number>; points: number; dayGroups: Set<string>; pointGroups: Set<string>; comment: boolean }>();
    const ensure = (stockCode: string, date: string) => {
        const k = chartKeyOf(stockCode, date);
        let e = idx.get(k);
        if (!e) {
            e = { stockCode, date, marks: new Map(), points: 0, dayGroups: new Set(), pointGroups: new Set(), comment: false };
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
    // 멤버십 — **층위를 유지한 채** 그 날의 흔적으로 담는다(시각 유무가 곧 층위). 둘 다 그 날의
    // 흔적이라 모수에는 같이 오르지만("타점에만 붙인 그룹"도 흔적이다), 무엇이 있는지는 갈라 센다.
    for (const m of memberships) {
        const e = ensure(m.stockCode, m.date);
        const bucket = isDayMembership(m) ? e.dayGroups : e.pointGroups;
        for (const name of m.groupNames) bucket.add(name);
    }
    for (const c of comments) ensure(c.stockCode, c.date).comment = true;

    const sorted = (s: Set<string>): string[] => [...s].sort((a, b) => a.localeCompare(b));
    const out = new Map<string, DayPresence>();
    for (const [k, e] of idx) out.set(k, { ...e, dayGroups: sorted(e.dayGroups), pointGroups: sorted(e.pointGroups) });
    return out;
}

/**
 * 후보 하루(분석의 모수) — 존재 지도에서 **편집물(앵커∪타점∪그룹) 있는 날**만 추린 것.
 * 코멘트만 있는 날은 제외한다: 후보는 "차트를 읽고 판단을 남긴 날"이고 코멘트는 기록이지 판단이 아니다
 * (옛 서버 union 의 정의 그대로 — 소비자는 깔때기 분모·레일 척도라 저장하지 않고 매번 파생한다).
 * 정렬은 날짜 내림차순 → 종목: 화면마다 순서가 흔들리지 않게 파생이 고정한다(옛 서버 정렬 계승).
 */
export function candidateDaysOf(index: ReadonlyMap<string, DayPresence>): { stockCode: string; date: string }[] {
    const out: { stockCode: string; date: string }[] = [];
    for (const d of index.values()) {
        if (d.marks.size > 0 || d.points > 0 || d.dayGroups.length > 0 || d.pointGroups.length > 0) {
            out.push({ stockCode: d.stockCode, date: d.date });
        }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.stockCode.localeCompare(b.stockCode));
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

/** 절 하나의 AND — "선 있음 ∧ 타점 없음" 같은 질문. */
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

/**
 * 필터 요약 문자열 — 컨트롤 줄·구독 패널 라벨 꼬리("무엇으로 걸렀나")용.
 * 표기는 & | — 논리 기호(∧∨)는 낯설다는 사용자 확정. 필터 줄의 구분자와 같은 문자를 쓴다.
 */
export function dnfSummary(dnf: PresenceDnf): string {
    const parts = dnf.filter(hasActiveFilter).map((c) =>
        PRESENCE_KINDS.filter((k) => (c[k.key] ?? "any") !== "any")
            .map((k) => (c[k.key] === "not" ? `!${k.name}` : k.name))
            .join(" & "),
    );
    return parts.join(" | ");
}

// ── DNF 편집 연산 ────────────────────────────────────────────────────────────
// 순수 함수로 모아 둔 이유: "마지막 칩을 지우면 절도 사라진다" 같은 규칙이 JSX 안에 숨으면
// 읽을 수도 시험할 수도 없다. 화면(WorksetFilterRow)은 손짓을 이 넷 중 하나로 옮길 뿐이다.
//
// ⚠ **빈 절은 만들지 않는다**(이 넷의 공통 사후조건). 빈 절은 평가에서 제외돼(hasActiveFilter)
// 화면엔 서는데 결과엔 영향이 없는 유령이 된다 — 그래서 절이 빌 자리에선 절을 통째로 뺀다.

/** 칩 좌클릭 — has ↔ not 만 오간다(제거는 우클릭 메뉴의 몫이라 여기서 any 로 안 간다). */
export const toggleTriState = (s: TriState): TriState => (s === "not" ? "has" : "not");

/** 칩 반전 — 절 안의 종류 하나를 has ↔ not. */
export function toggleKind(dnf: PresenceDnf, ci: number, key: string): PresenceDnf {
    return dnf.map((c, i) => (i === ci ? { ...c, [key]: toggleTriState(c[key] ?? "has") } : c));
}

/** 절에 종류 추가(AND) — 새 칩은 늘 has 로 들어온다. */
export function addKind(dnf: PresenceDnf, ci: number, key: string): PresenceDnf {
    return dnf.map((c, i) => (i === ci ? { ...c, [key]: "has" } : c));
}

/** 칩 지우기 — 절의 마지막 칩이었으면 절까지 함께 사라진다(빈 절 금지). */
export function removeKind(dnf: PresenceDnf, ci: number, key: string): PresenceDnf {
    const out: PresenceFilter[] = [];
    dnf.forEach((c, i) => {
        if (i !== ci) { out.push(c); return; }
        const { [key]: _drop, ...rest } = c as Record<string, TriState>;
        if (Object.keys(rest).length > 0) out.push(rest);
    });
    return out;
}

/** 절(필터) 통째 지우기. */
export function removeClause(dnf: PresenceDnf, ci: number): PresenceDnf {
    return dnf.filter((_, i) => i !== ci);
}

/** 레지스트리에 있는 종류 키 — 영속 복원이 모르는 키를 버리는 기준. */
const KNOWN_KINDS = new Set(PRESENCE_KINDS.map((k) => k.key));

/**
 * 영속 복원 — 아는 **종류·상태값**만 살린다(깨진 저장값이 "전부 숨김"으로 오독되면 안 된다).
 * 모르는 키를 버리는 이유: 평가(matchesPresence)는 레지스트리를 돌기 때문에 사라진 종류의 칩은
 * 화면에도 안 서고 결과도 안 바꾸는 유령으로 남는다. 옛 층위 없는 `group` 칩이 여기서 정리된다.
 * 옛 형식(절 하나짜리 Record)은 절 목록 [절] 로 감싸 무손실 승계한다 — usePersistedState 는 다시
 * 저장할 때까지 옛 값을 그대로 두므로 이 변환은 일회성 이관이 아니라 읽기 규칙이다(setRef 선례).
 */
export function parsePresenceDnf(raw: unknown): PresenceDnf | null {
    const parseClause = (o: unknown): PresenceFilter | null => {
        if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
        const out: Record<string, TriState> = {};
        for (const [k, v] of Object.entries(o)) if (KNOWN_KINDS.has(k) && (v === "has" || v === "not")) out[k] = v;
        return out;
    };
    if (Array.isArray(raw)) {
        // 빈 절은 버린다 — 평가에선 이미 제외되는데 화면엔 라벨 없는 토큰으로 서던 유령이다
        // (칩 순환이 has→not→제거였던 시절의 저장본에 남아 있다).
        return raw.map(parseClause).filter((c): c is PresenceFilter => c !== null && Object.keys(c).length > 0);
    }
    const single = parseClause(raw);
    return single === null ? null : Object.keys(single).length > 0 ? [single] : [];
}
