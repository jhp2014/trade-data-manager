// 그룹 필터식(순수) — DNF: **그룹끼리 OR(|), 그룹 안 리터럴끼리 AND(&)**, 리터럴마다 부정(!).
//   (돌파 & !눌림) | (갭상승) | (타점 그룹 없음)
// 임의의 불리언식은 DNF 로 환원되니 표현력은 충분하고, 편집이 두 동작으로 끝난다:
//   · 팔레트에서 고르면 **단독 그룹**으로 추가(= OR 로 붙는다)
//   · 칩을 다른 칩 위로 끌면 그 그룹에 합류(= &), 밖으로 끌면 다시 단독 그룹(= |)
// 같은 그룹를 여러 번 넣는 건 허용한다 — 의미가 생기는 건 서로 다른 그룹에 들어갈 때뿐이다
// ((A∧B) ∨ (A∧C)). 반대로 **한 그룹 안의 중복·모순은 막는다**: A∧A 는 무의미하고 A∧!A 는 항상 거짓이라
// "필터를 걸었는데 결과가 0" 의 원인이 화면에서 안 보인다.
//
// **판정은 여기 없다** — 3치(통과/탈락/모름)로 재료를 보며 재는 건 filter/evaluate 의 몫이다.
// 한때 여기에도 불리언 판정기(evalGroupExpr)가 있었는데, 그건 "붙은 이름들" 배열만 받아 **층위를
// 볼 수 없는** 두 번째 규칙이었다. 규칙이 두 벌이면 "없음"의 뜻이 두 곳에서 각자 자란다.
import type { Grain } from "@trade-data-manager/market/domain";

/**
 * "그 층위 그룹이 하나도 없음"을 가리키는 특수 리터럴 — **층위마다 하나**. 실제 그룹 이름과는
 * `@` 로 갈린다(그룹 이름에 `@` 를 쓰는 일은 없다).
 *
 * ⚠ 왜 층위가 붙나: 그룹은 하루(차트에만 붙음)와 타점(타점에만 붙음)으로 갈리고, 조회할 때 **하루
 * 그룹은 그날 타점 전부에 상속**된다. 양의 리터럴에겐 그게 원하는 동작이지만("그날 테마가 A"),
 * 층위 없는 "없음"은 그 합집합에 대고 0개를 물어 **하루 그룹 하나가 타점 미분류를 통째로 가렸다**
 * (분봉 골격에서 "아직 분류 안 한 타점"을 영원히 못 찾던 자리). 없음도 층위를 말해야 뜻이 선다.
 */
export const NONE_DAY = "@none:day";
export const NONE_POINT = "@none:point";

/** 옛 층위 없는 없음 — 새 규칙(한 필터 = 한 층위)에 자리가 없어 **읽을 때 버린다**(parseGroupExpr). */
const LEGACY_NONE = "@none";

/** 이 층위의 "없음" 리터럴. */
export const noneLiteral = (scope: Grain): string => (scope === "day" ? NONE_DAY : NONE_POINT);

/** 이 리터럴이 "없음"이면 그 층위, 실제 그룹이면 undefined. 층위 계산·팔레트 제약이 같이 쓴다. */
export const noneScope = (groupId: string): Grain | undefined =>
    groupId === NONE_DAY ? "day" : groupId === NONE_POINT ? "point" : undefined;

export const isNoneLiteral = (groupId: string): boolean => noneScope(groupId) !== undefined;

/**
 * 화면 이름 — 리터럴 바로 옆에 둔다. 층위가 이름의 절반이라(`하루` 그룹 없음 / `타점` 그룹 없음)
 * 떨어져 있으면 한쪽만 고쳐져 칩과 팔레트가 서로 다른 말을 한다. 칩·요약 라벨·팔레트가 같이 쓴다.
 */
export const noneLabelOf = (scope: Grain): string => (scope === "day" ? "하루 그룹 없음" : "타점 그룹 없음");

export interface GroupLiteral {
    groupId: string; // 실제 그룹 이름 또는 "…그룹 없음" 리터럴(NONE_DAY·NONE_POINT)
    neg: boolean; // 클릭으로 토글(!)
}
export interface ExprClause {
    literals: GroupLiteral[]; // AND
}
/** groups 가 비면 **무제한**(이 차원 필터 없음). 다른 차원(밴드·날짜·시간)과는 AND. */
export interface GroupExpr {
    groups: ExprClause[]; // OR
}

export const EMPTY_TAG_EXPR: GroupExpr = { groups: [] };
export const isGroupExprEmpty = (e: GroupExpr): boolean => e.groups.length === 0;
/** 화면에 보이는 리터럴 총수(칩 개수) — 요약 표시용. */
export const groupLiteralCount = (e: GroupExpr): number => e.groups.reduce((n, g) => n + g.literals.length, 0);

// ── 편집 연산(전부 불변) ────────────────────────────────────────────────────

/** 팔레트에서 고른 그룹를 **단독 그룹**으로 추가(OR). 같은 그룹이 이미 다른 그룹에 있어도 허용. */
export function addGroupLiteral(expr: GroupExpr, groupId: string): GroupExpr {
    return { groups: [...expr.groups, { literals: [{ groupId, neg: false }] }] };
}

/** 리터럴 부정 토글(칩 클릭). */
export function toggleGroupNeg(expr: GroupExpr, gi: number, li: number): GroupExpr {
    return mapGroups(expr, gi, (g) => ({ literals: g.literals.map((l, i) => (i === li ? { ...l, neg: !l.neg } : l)) }));
}

/** 리터럴 제거(칩 ✕). 비워진 그룹은 사라진다. */
export function removeGroupLiteral(expr: GroupExpr, gi: number, li: number): GroupExpr {
    const groups = expr.groups
        .map((g, i) => (i === gi ? { literals: g.literals.filter((_, j) => j !== li) } : g))
        .filter((g) => g.literals.length > 0);
    return { groups };
}

/**
 * 리터럴 이동 — 드래그의 유일한 연산.
 *   to = 그룹 인덱스 → 그 그룹에 합류(AND). 이미 같은 그룹이 그 그룹에 있으면(중복·모순) **거부**(원본 그대로).
 *   to = "new"      → 단독 그룹으로 떼어냄(OR). 원래 혼자였으면 아무 일도 안 한다.
 * 비워진 원래 그룹은 사라지고, 그때 뒤 인덱스가 당겨지는 것까지 여기서 처리한다.
 */
export function moveGroupLiteral(expr: GroupExpr, gi: number, li: number, to: number | "new"): GroupExpr {
    const src = expr.groups[gi];
    const lit = src?.literals[li];
    if (!lit) return expr;
    if (to === gi) return expr; // 제자리
    if (to === "new" && src.literals.length === 1) return expr; // 이미 단독 그룹

    if (typeof to === "number") {
        const dst = expr.groups[to];
        if (!dst) return expr;
        if (dst.literals.some((l) => l.groupId === lit.groupId)) return expr; // 같은 그룹 안 중복/모순 차단
    }

    const groups = expr.groups.map((g, i) => (i === gi ? { literals: g.literals.filter((_, j) => j !== li) } : g));
    if (typeof to === "number") groups[to] = { literals: [...groups[to].literals, lit] };
    else groups.push({ literals: [lit] });
    return { groups: groups.filter((g) => g.literals.length > 0) };
}

function mapGroups(expr: GroupExpr, gi: number, fn: (g: ExprClause) => ExprClause): GroupExpr {
    if (!expr.groups[gi]) return expr;
    return { groups: expr.groups.map((g, i) => (i === gi ? fn(g) : g)) };
}

/**
 * 영속/저장 필터에서 읽은 값 검증 — 형태가 안 맞으면 null(호출부가 빈 식으로 폴백).
 *
 * 옛 층위 없는 `@none` 은 **리터럴째 버린다**. 그 뜻("하루도 타점도 0개")은 두 층위에 걸쳐 있어
 * 한 필터 안에 옮겨 담을 자리가 없고(한 필터 = 한 층위), 부정형은 절을 분배해야 해서 사람이 만든 적
 * 없는 모양이 된다. 버리면 그 조건만 넓어지고 나머지는 그대로다 — 조건은 다시 걸면 되는 임시 저장물이다.
 * 리터럴이 다 빠진 절은 아래 `literals.length > 0` 이 자연히 걷어낸다.
 */
export function parseGroupExpr(o: unknown): GroupExpr | null {
    if (!o || typeof o !== "object") return null;
    const groups = (o as { groups?: unknown }).groups;
    if (!Array.isArray(groups)) return null;
    const out: ExprClause[] = [];
    for (const g of groups) {
        const lits = (g as { literals?: unknown })?.literals;
        if (!Array.isArray(lits)) return null;
        const literals: GroupLiteral[] = [];
        for (const l of lits) {
            const t = (l as { groupId?: unknown; neg?: unknown })?.groupId;
            if (typeof t !== "string") return null;
            if (t === LEGACY_NONE) continue; // 층위 없는 옛 없음 — 버린다
            literals.push({ groupId: t, neg: (l as { neg?: unknown }).neg === true });
        }
        if (literals.length > 0) out.push({ literals });
    }
    return { groups: out };
}
