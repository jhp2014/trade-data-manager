// 그룹 필터식(순수) — DNF: **그룹끼리 OR(|), 그룹 안 리터럴끼리 AND(&)**, 리터럴마다 부정(!).
//   (돌파 & !눌림) | (갭상승) | (그룹없음)
// 임의의 불리언식은 DNF 로 환원되니 표현력은 충분하고, 편집이 두 동작으로 끝난다:
//   · 팔레트에서 고르면 **단독 그룹**으로 추가(= OR 로 붙는다)
//   · 칩을 다른 칩 위로 끌면 그 그룹에 합류(= &), 밖으로 끌면 다시 단독 그룹(= |)
// 같은 그룹를 여러 번 넣는 건 허용한다 — 의미가 생기는 건 서로 다른 그룹에 들어갈 때뿐이다
// ((A∧B) ∨ (A∧C)). 반대로 **한 그룹 안의 중복·모순은 막는다**: A∧A 는 무의미하고 A∧!A 는 항상 거짓이라
// "필터를 걸었는데 결과가 0" 의 원인이 화면에서 안 보인다.

/** 그룹 0개인 타점을 가리키는 특수 리터럴. 실제 groupId 는 숫자 문자열이라 충돌하지 않는다. */
export const NO_TAGS = "@none";

export interface GroupLiteral {
    groupId: string; // 실제 그룹 id 또는 NO_TAGS
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

/** 한 타점(붙은 그룹 id들)이 식을 통과하는가. 빈 식 = 전부 통과. */
export function evalGroupExpr(groupIds: readonly string[], expr: GroupExpr): boolean {
    if (expr.groups.length === 0) return true;
    return expr.groups.some((g) => g.literals.every((l) => matchLiteral(groupIds, l)));
}

function matchLiteral(groupIds: readonly string[], l: GroupLiteral): boolean {
    const has = l.groupId === NO_TAGS ? groupIds.length === 0 : groupIds.includes(l.groupId);
    return l.neg ? !has : has;
}

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

/** 영속/저장 필터에서 읽은 값 검증 — 형태가 안 맞으면 null(호출부가 빈 식으로 폴백). */
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
            literals.push({ groupId: t, neg: (l as { neg?: unknown }).neg === true });
        }
        if (literals.length > 0) out.push({ literals });
    }
    return { groups: out };
}
