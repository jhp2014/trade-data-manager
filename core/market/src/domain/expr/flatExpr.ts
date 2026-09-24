// **평평한 식**의 구조 규칙(순수) — 항 종류와 무관한 한 벌. 규칙 전문은 `.claude/decisions.md`
// 「집합 편성 — 가로 드릴다운 줄」·「괄호는 손의 것」.
//
//   식 = 항들(of) + 항 사이 연산자들(ops) + **한 겹 괄호**(groups)
//
// 두 소비자가 **같은 이 규칙**을 쓴다: 생성소의 집합 식(워크벤치 `SetExpr` — 항 = 조건·참조)과 「돌파」의
// 사슬 필터 식(`ChainFilter` — 항 = 봉 조건). 두 벌이면 같은 줄이 두 곳에서 다른 뜻이 된다(옛 "필터 UI 가
// 두 곳" 함정의 식 판). 항 종류에 묶인 것(항 id·참조·잎 목록)은 소비자 몫이라 여기 없다.
//
// ## 숨은 우선순위가 없다 — 섞이는 순간 괄호가 박힌다
// 불변식: **괄호 밖의 연산자는 전부 같고, 각 괄호 안의 연산자도 전부 같다**(`oneLayerHolds`).
//
// ## 괄호는 손의 것이다
// 괄호가 **하나도 없을 때** 연산자를 섞으면 자동으로 박힌다. 그 뒤로는 사람 것이라 **자동으로 안
// 사라지고**, 불변식을 깨는 편집은 **거절**한다(식이 안 바뀐다 — 화면이 이유를 말한다).
//
// ## 괄호의 수식어 — NOT · 순번
// 괄호는 NOT(`neg`)과 **순번**(`firstK` — 사슬 필터 전용: 그 괄호를 통과한 봉 중 사슬 안 처음 K개)을 들 수
// 있다. 수식어가 붙은 괄호는 **자르거나 풀 수 없다**(수식어가 갈 곳이 없다 — 드모르간·분배로 옮기지 않는다).
// 항이 빠져 괄호가 한 항으로 줄면 수식어는 **그 항으로 내려앉는다**(`absorb` — 항 종류가 규칙을 안다).

export type Op = "and" | "or";

export interface Negatable {
    /** 부정 — 부재 = 거짓. */
    neg?: boolean;
}

/** 괄호 한 겹 — 항 인덱스 구간(양끝 포함). 길이 2 이상이고 서로 겹치지 않는다. */
export interface FlatGroup {
    from: number;
    to: number;
    neg?: boolean;
    /** 순번 수식어(사슬 필터 전용) — 이 괄호를 통과한 봉 중 사슬 안 처음 K개. 부재 = 전부. */
    firstK?: number;
}

/** ⚠ `ops.length === max(of.length - 1, 0)` 이 불변식 — 항 수를 바꾸는 길은 `pruneFlat`/`appendFlat` 둘뿐. */
export interface FlatExpr<T extends Negatable> {
    id: string;
    of: T[];
    ops: Op[];
    groups: FlatGroup[];
}

/** 한 항으로 줄어든 괄호의 수식어를 그 항에 싣는다. 기본은 NOT 만(XOR — `NOT(NOT A) = A`). */
export type Absorb<T extends Negatable> = (t: T, g: FlatGroup) => T;

/** 항 하나에 NOT 을 겹친다 — 두 번이면 상쇄. */
export function xorNeg<T extends Negatable>(t: T, neg: boolean): T {
    if (!neg) return t;
    if (t.neg === true) {
        const { neg: _drop, ...rest } = t;
        return rest as T;
    }
    return { ...t, neg: true };
}

const defaultAbsorb = <T extends Negatable>(t: T, g: FlatGroup): T => xorNeg(t, g.neg === true);

/** 수식어가 붙은 괄호인가 — 자르기·풀기·잇기를 거절하는 자. */
export const isDecorated = (g: FlatGroup): boolean => g.neg === true || g.firstK !== undefined;

/** 온전한 괄호 — 길이 2 이상, 줄 전체를 덮는 괄호는 **수식어가 있을 때만** 뜻이 있다. */
const usableGroup = (g: FlatGroup, n: number): boolean =>
    g.to > g.from && (isDecorated(g) || !(g.from === 0 && g.to === n - 1));

/** 괄호 밖 경계들의 연산자. */
const outsideOps = (ops: readonly Op[], groups: readonly FlatGroup[]): Op[] =>
    ops.filter((_, i) => !groups.some((g) => g.from <= i && i + 1 <= g.to));

/** 한 겹이 성립하나 — 괄호 안도 밖도 연산자가 균일해야 한다. */
export function oneLayerHolds(ops: readonly Op[], groups: readonly FlatGroup[]): boolean {
    for (const g of groups) for (let i = g.from; i < g.to; i++) if (ops[i] !== ops[g.from]) return false;
    const out = outsideOps(ops, groups);
    return out.every((o) => o === out[0]);
}

/** 괄호를 다시 친다 — `top` 과 다른 연산자의 연속 구간을 전부 괄호로. 결과는 늘 한 겹. */
function regroup(n: number, ops: readonly Op[], top: Op): FlatGroup[] {
    const groups: FlatGroup[] = [];
    let run = -1;
    for (let i = 0; i <= ops.length; i++) {
        const other = i < ops.length && ops[i] !== top;
        if (other && run < 0) run = i;
        if (!other && run >= 0) {
            groups.push({ from: run, to: i });
            run = -1;
        }
    }
    return groups.filter((g) => usableGroup(g, n));
}

/**
 * 모양을 성립하게 다듬는다 — `ops` 길이 보정, 괄호 정렬·클램프·겹침 제거, 한 항짜리 괄호 접기(수식어는
 * 그 항으로), 불변식 강제(깨진 채 들어온 저장물만 — 정상 경로의 편집은 깨지는 변경을 애초에 거절한다).
 */
export function normalizeFlat<T extends Negatable>(e: FlatExpr<T>, absorb: Absorb<T> = defaultAbsorb): FlatExpr<T> {
    const n = e.of.length;
    const want = Math.max(n - 1, 0);
    const ops = e.ops.length === want ? e.ops : Array.from({ length: want }, (_, i) => e.ops[i] ?? e.ops[e.ops.length - 1] ?? "and");
    let of = e.of;
    const sorted = [...e.groups]
        .map((g) => ({ ...g, from: Math.max(0, Math.min(g.from, n - 1)), to: Math.max(0, Math.min(g.to, n - 1)) }))
        .sort((a, b) => a.from - b.from);
    const cleaned: FlatGroup[] = [];
    for (const g of sorted) {
        if (cleaned.length > 0 && g.from <= cleaned[cleaned.length - 1]!.to) continue; // 겹침 — 뒤엣것을 버린다
        if (g.to === g.from) {
            // ⚠ 한 항으로 줄어든 괄호는 접힌다 — 수식어는 그 항으로 내려앉는다(버리면 조용히 증발한다).
            if (isDecorated(g) && of[g.from] !== undefined) {
                of = of === e.of ? [...of] : of;
                of[g.from] = absorb(of[g.from]!, g);
            }
            continue;
        }
        if (!usableGroup(g, n)) continue;
        cleaned.push(g);
    }
    const groups = oneLayerHolds(ops, cleaned) ? cleaned : regroup(n, ops, outsideOps(ops, cleaned)[0] ?? ops[0] ?? "and");
    const same = of === e.of && ops === e.ops && groups.length === e.groups.length
        && groups.every((g, i) => {
            const o = e.groups[i]!;
            return g.from === o.from && g.to === o.to && g.neg === o.neg && g.firstK === o.firstK;
        });
    return same ? e : { ...e, of, ops, groups };
}

/** 경계 `i`(항 i 와 i+1 사이)를 품은 괄호 — 없으면 null. */
export const groupAtBoundary = <T extends Negatable>(e: FlatExpr<T>, i: number): FlatGroup | null =>
    e.groups.find((g) => g.from <= i && i + 1 <= g.to) ?? null;

/** 괄호 **밖**의 연산자 — 줄 전체의 성질. 경계가 전부 괄호 안이거나 항이 하나면 `and`. */
export function topOpOf<T extends Negatable>(e: FlatExpr<T>): Op {
    for (let i = 0; i < e.ops.length; i++) if (groupAtBoundary(e, i) === null) return e.ops[i]!;
    return "and";
}

/** 경계 `i` 의 연산자. */
export const opAt = <T extends Negatable>(e: FlatExpr<T>, i: number): Op => e.ops[i] ?? "and";

/**
 * 연산자 바꾸기 — 괄호가 없으면 그 자리를 바깥으로 삼아 자동으로 박고, 있으면 한 겹을 깨는 변경을 **거절**한다.
 */
export function setOpAt<T extends Negatable>(e: FlatExpr<T>, i: number, op: Op): FlatExpr<T> {
    if (i < 0 || i >= e.ops.length || e.ops[i] === op) return e;
    const ops = e.ops.map((o, k) => (k === i ? op : o));
    if (e.groups.length === 0) return normalizeFlat({ ...e, ops, groups: regroup(e.of.length, ops, op) });
    if (!oneLayerHolds(ops, e.groups)) return e;
    return normalizeFlat({ ...e, ops });
}

export const canSetOpAt = <T extends Negatable>(e: FlatExpr<T>, i: number, op: Op): boolean =>
    i >= 0 && i < e.ops.length && (e.ops[i] === op || e.groups.length === 0
        || oneLayerHolds(e.ops.map((o, k) => (k === i ? op : o)), e.groups));

/**
 * **경계 토글** — 괄호 조작의 유일한 손. 경계가 괄호 밖이면 삼키고(새 괄호/넓히기), 안이면 자른다(쪼개기/풀기).
 * 수식어 붙은 괄호는 못 자른다. 양옆이 다 괄호면 잇는 셈이라 거절한다. 한 겹이 깨지면 거절한다.
 */
export function toggleBoundaryGroup<T extends Negatable>(e: FlatExpr<T>, i: number): FlatExpr<T> {
    if (i < 0 || i >= e.ops.length) return e;
    const inside = e.groups.find((g) => g.from <= i && i + 1 <= g.to);
    if (inside) {
        if (isDecorated(inside)) return e;
        const rest = e.groups.filter((g) => g !== inside);
        return normalizeFlat({ ...e, groups: [...rest, { from: inside.from, to: i }, { from: i + 1, to: inside.to }] });
    }
    const left = e.groups.find((g) => g.to === i);
    const right = e.groups.find((g) => g.from === i + 1);
    if (left && right) return e;
    const grown: FlatGroup = left ? { ...left, to: i + 1 } : right ? { ...right, from: i } : { from: i, to: i + 1 };
    const next = [...e.groups.filter((g) => g !== left && g !== right), grown];
    if (!oneLayerHolds(e.ops, next)) return e;
    return normalizeFlat({ ...e, groups: next });
}

export const canToggleBoundary = <T extends Negatable>(e: FlatExpr<T>, i: number): boolean => toggleBoundaryGroup(e, i) !== e;

/** 괄호 통째 풀기 — 수식어가 붙어 있으면 거절(갈 곳이 없다). */
export function removeGroupAt<T extends Negatable>(e: FlatExpr<T>, from: number): FlatExpr<T> {
    const g = e.groups.find((x) => x.from === from);
    if (!g || isDecorated(g)) return e;
    return normalizeFlat({ ...e, groups: e.groups.filter((x) => x !== g) });
}

/** 괄호 부정 토글 — 경계 `i` 를 품은 괄호. */
export function negateGroupAt<T extends Negatable>(e: FlatExpr<T>, i: number): FlatExpr<T> {
    const g = e.groups.find((x) => x.from <= i && i + 1 <= x.to);
    if (!g) return e;
    const next = e.groups.map((x) => {
        if (x !== g) return x;
        if (x.neg === true) {
            const { neg: _drop, ...rest } = x;
            return rest;
        }
        return { ...x, neg: true };
    });
    return normalizeFlat({ ...e, groups: next });
}

/** 괄호 순번 — 경계 `i` 를 품은 괄호에 처음 K개를 걸거나(숫자) 뗀다(undefined). */
export function setGroupFirstK<T extends Negatable>(e: FlatExpr<T>, i: number, firstK: number | undefined): FlatExpr<T> {
    const g = e.groups.find((x) => x.from <= i && i + 1 <= x.to);
    if (!g || g.firstK === firstK) return e;
    const next = e.groups.map((x) => {
        if (x !== g) return x;
        const { firstK: _drop, ...rest } = x;
        return firstK === undefined ? rest : { ...rest, firstK };
    });
    return normalizeFlat({ ...e, groups: next });
}

/** 줄 전체를 한 연산자로 — 괄호가 통째로 사라진다(수식어 붙은 괄호가 있으면 거절). */
export function setAllOps<T extends Negatable>(e: FlatExpr<T>, op: Op): FlatExpr<T> {
    if (e.groups.some(isDecorated)) return e;
    return normalizeFlat({ ...e, ops: e.ops.map(() => op), groups: [] });
}

// ── 항 수를 바꾸는 유일한 두 길 ────────────────────────────────────────────

/** 항을 걸러낸다 — `ops`·`groups` 를 같이 옮기는 유일한 자리(남는 항 앞 연산자는 원본에서 그 항 바로 앞의 것). */
export function pruneFlat<T extends Negatable>(e: FlatExpr<T>, keep: (t: T) => boolean, absorb: Absorb<T> = defaultAbsorb): FlatExpr<T> {
    const keepIdx: number[] = [];
    e.of.forEach((t, i) => { if (keep(t)) keepIdx.push(i); });
    if (keepIdx.length === e.of.length) return e;
    return rebuildFlat(e.id, keepIdx.map((i) => e.of[i]!), keepIdx, e.ops, e.groups, absorb);
}

/**
 * 살아남은 항과 그 **원래 자리**로 식을 다시 짓는다 — `pruneFlat` 과 저장물 파서가 같은 규칙을 쓴다
 * (연산자·괄호를 원래 자리 기준으로 되짚는다. 한 항만 남은 괄호도 버리지 않는다 — 수식어가 내려앉는다).
 */
export function rebuildFlat<T extends Negatable>(
    id: string,
    of: T[],
    fromIdx: readonly number[],
    rawOps: readonly Op[],
    rawGroups: readonly FlatGroup[],
    absorb: Absorb<T> = defaultAbsorb,
): FlatExpr<T> {
    const ops: Op[] = [];
    for (let n = 1; n < fromIdx.length; n++) ops.push(rawOps[fromIdx[n]! - 1] ?? "and");
    const at = new Map<number, number>();
    fromIdx.forEach((old, next) => at.set(old, next));
    const groups: FlatGroup[] = [];
    for (const g of rawGroups) {
        const inside = fromIdx.filter((i) => i >= g.from && i <= g.to).map((i) => at.get(i)!);
        if (inside.length >= 1) groups.push({ ...g, from: inside[0]!, to: inside[inside.length - 1]! });
    }
    return normalizeFlat({ id, of, ops, groups }, absorb);
}

/** 항 하나를 끝에 붙인다 — 연산자를 안 주면 줄의 바깥 연산자를 따른다(새 항이 조용히 뜻을 바꾸지 않게). */
export function appendFlat<T extends Negatable>(e: FlatExpr<T>, t: T, op?: Op): FlatExpr<T> {
    const of = [...e.of, t];
    if (e.of.length === 0) return normalizeFlat({ ...e, of, ops: [], groups: [] });
    const use = op ?? topOpOf(e);
    const ops: Op[] = [...e.ops, use];
    const groups = op === undefined ? e.groups : regroup(of.length, ops, use);
    return normalizeFlat({ ...e, of, ops, groups });
}

// ── 접기 — 평평한 식 → 한 겹 트리 ──────────────────────────────────────────

/** 접힌 묶음 — 괄호 하나 또는 줄 전체. `kind` 가 항 종류와 겹치지 않아야 갈린다(항은 and/or 를 kind 로 안 쓴다). */
export interface FoldedFlat<T> {
    kind: Op;
    id: string;
    of: (T | FoldedFlat<T>)[];
    neg?: boolean;
    firstK?: number;
}

export const isFoldedFlat = <T>(x: T | FoldedFlat<T>): x is FoldedFlat<T> =>
    (x as { kind?: unknown }).kind === "and" || (x as { kind?: unknown }).kind === "or";

const foldMemo = new WeakMap<object, FoldedFlat<unknown>>();

/**
 * 평평한 식 → 한 겹 트리. 접는 규칙이 사는 **유일한 곳**이다 — 평가도 표시도 전부 이걸 지난다.
 * 식 객체에 메모한다(항목마다 불려도 접기는 한 번).
 */
export function foldFlat<T extends Negatable>(e: FlatExpr<T>): FoldedFlat<T> {
    const hit = foldMemo.get(e);
    if (hit !== undefined) return hit as FoldedFlat<T>;
    const of: (T | FoldedFlat<T>)[] = [];
    let i = 0;
    while (i < e.of.length) {
        const g = e.groups.find((x) => x.from === i) ?? null;
        if (g === null) {
            of.push(e.of[i]!);
            i += 1;
            continue;
        }
        of.push({
            kind: opAt(e, g.from), id: `${e.id}#g${g.from}`, of: e.of.slice(g.from, g.to + 1),
            ...(g.neg === true ? { neg: true as const } : {}),
            ...(g.firstK !== undefined ? { firstK: g.firstK } : {}),
        });
        i = g.to + 1;
    }
    const made: FoldedFlat<T> = { kind: topOpOf(e), id: e.id, of };
    foldMemo.set(e, made as FoldedFlat<unknown>);
    return made;
}

/** 저장물의 연산자 한 칸. */
export const parseOp = (v: unknown): Op => (v === "or" ? "or" : "and");

/** 저장물의 괄호들 — 모양만 본다(구간 정합은 `rebuildFlat`·`normalizeFlat` 이 받는다). */
export function parseGroups(raw: unknown): FlatGroup[] {
    const out: FlatGroup[] = [];
    for (const r of Array.isArray(raw) ? raw : []) {
        if (typeof r !== "object" || r === null) continue;
        const g = r as { from?: unknown; to?: unknown; neg?: unknown; firstK?: unknown };
        if (typeof g.from !== "number" || typeof g.to !== "number") continue;
        const k = typeof g.firstK === "number" && Number.isFinite(g.firstK) && g.firstK >= 1 ? Math.floor(g.firstK) : undefined;
        out.push({ from: g.from, to: g.to, ...(g.neg === true ? { neg: true } : {}), ...(k !== undefined ? { firstK: k } : {}) });
    }
    return out;
}
