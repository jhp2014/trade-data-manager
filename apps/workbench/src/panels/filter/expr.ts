// 집합의 **식**(순수) — 규칙 전문은 `.claude/decisions.md` 「집합 편성 — 가로 드릴다운 줄」.
//
//   집합 = 이름 + 식
//   식   = 항들 + 항 사이의 연산자들 + **한 겹 괄호**
//   항   = NOT? 조건 | NOT? 참조
//
// ## 저장은 평평하고, 접는 것은 평가 때 한 번이다
// `of[]`(항) 와 `ops[]`(항 사이 연산자) 와 `groups[]`(괄호 구간)로 **평평하게** 둔다. 트리는
// `foldExpr` 이 한 곳에서 만든다 — 저장이 평평해야 잎 id 를 주소로 쓰는 영속물(시트 결과 열
// `out:i:<id>` · 급타점 축 `c:hot:<id>` · 테마 연동)이 모양 변경에 안 흔들린다.
//
// ## 괄호는 「이름이 필요 없는 묶음」이다
// 익명 금지는 **내용이 아랫줄에 숨는** 묶음의 규칙이다. 줄 안의 괄호는 내용이 그 자리에 다 보이므로
// 이름이 지킬 것이 없다. 겹은 **하나까지** — 더 필요하면 이름 붙여 층으로 올린다.
//
// ## 숨은 우선순위가 없다 — 섞이는 순간 괄호가 박힌다
// 불변식: **괄호 밖의 연산자는 전부 같고, 각 괄호 안의 연산자도 전부 같다**(`oneLayerHolds`).
// 그래서 `a OR b AND c` 같은 "읽는 규칙을 알아야 뜻이 정해지는" 식이 **존재할 수 없다**.
//
// ## 괄호는 손의 것이다 (2026-09-22)
// 괄호가 **하나도 없을 때** 연산자를 섞으면 자동으로 박힌다(모호한 식 방지). 그 뒤로는 사람 것이라
// **자동으로 안 사라지고**, 불변식을 깨는 편집은 **거절**한다(식을 안 바꾸고 화면이 이유를 말한다).
// 조작은 경계 토글 하나다(`toggleBoundaryGroup` — 밖이면 삼키고 안이면 거기서 자른다).
//
// ## 중첩은 식 안이 아니라 **집합 사이**에 있다
// 묶음이 곧 저장 집합이므로, 안쪽 묶음은 그 자리에 **참조**로 선다.
//
// ⚠ **참조는 그 자리에서 못 고친다** — 고치면 그 집합을 쓰는 다른 식이 전부 따라 바뀐다.
// 편집하려면 그 집합으로 **내려가야** 한다. 순환 참조는 저장 시 거절한다(무한 평가).
//
// ## 부정은 노드가 아니라 **수식어**다
// `NOT(NOT(x))` 같은 사슬이 생기지 않게 `neg?: boolean` 을 항에 단다(부재 = 거짓).
// **루트는 부정을 안 든다** — 집합 자체의 부정은 그 집합을 참조하는 쪽에서 건다.
import { isPredicateEmpty, type FilterStage } from "./stage.js";

/** 항의 식별자 — 짚은 자리·편집면이 이 id 를 주소로 쓴다. 조건 항의 주소는 `stage.id`. */
export type NodeId = string;

/** 항 사이의 연산자 — 낱말로 그린다(`AND`/`OR`). */
export type Op = "and" | "or";

interface Negatable {
    /** 부정 — 부재 = 거짓. `not3` 규칙이라 **결손의 부정은 결손**이다(모름을 뒤집어도 모름). */
    neg?: boolean;
}

/** 항 하나 — 조건이거나 다른 집합 한 벌. 중첩은 **참조로** 간다(식 안에 묶음이 없다). */
export type SetTerm =
    | ({ kind: "cond"; stage: FilterStage } & Negatable)
    /** 다른 저장 집합 한 벌 — 내용은 그 집합의 것이고, 여기선 멤버십만 묻는다. */
    | ({ kind: "ref"; id: NodeId; setId: string } & Negatable);

/**
 * 괄호 한 겹 — **항 인덱스 구간**(양끝 포함). 길이 2 이상이고 서로 겹치지 않는다.
 *
 * ⚠ **괄호는 손의 것이다**(2026-09-22) — 첫 섞임에 자동으로 박히지만 **자동으로는 안 사라진다**.
 * 자동으로 걷히면 `NOT(a OR b) AND c` 에서 OR 을 AND 로 바꾸는 순간 **NOT 이 조용히 증발한다**.
 */
export interface Group {
    from: number;
    to: number;
    /** 이 괄호의 부정 — `not3` 그대로 내려간다(모름을 뒤집어도 모름). */
    neg?: boolean;
}

/**
 * 집합의 식 — 항들 + 항 사이 연산자 + 한 겹 괄호.
 *
 * ⚠ `ops.length === max(of.length - 1, 0)` 이 불변식이다. 항을 지우는 손이 `ops`·`groups` 를 같이
 * 옮기지 않으면 **오류 없이 다른 식**이 된다(`a AND b OR c` 에서 b 를 지우면 `a AND c` 가 된다).
 * 그래서 항 수를 바꾸는 길은 `pruneTerms`/`appendTerm` 둘뿐이다.
 */
export interface SetExpr {
    id: NodeId;
    of: SetTerm[];
    ops: Op[];
    groups: Group[];
}

/** 항 id 발급 — 조건 항의 주소(`stage.id`, `s…`)와 이름공간을 가른다(`n…`). */
let nodeSeq = 0;
export const newNodeId = (): NodeId => `n${Date.now().toString(36)}${(nodeSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 루트 id — 빈 식이 늘 같은 자리를 갖게 고정한다(아무도 주소로 안 쓰지만 diff 가 안정된다). */
export const ROOT_ID = "root";

/** 빈 식 — 조건 0개. "제한 없음"이지 "전부 탈락"이 아니다(소비자는 isFiltering 으로 가른다). */
export const emptyExpr = (): SetExpr => ({ id: ROOT_ID, of: [], ops: [], groups: [] });

/** 조건 리스트 → AND 한 벌. 테스트·기본값이 쓰는 지름길(괄호 없음). */
export const exprOfStages = (stages: readonly FilterStage[]): SetExpr => ({
    id: ROOT_ID,
    of: stages.map((stage): SetTerm => ({ kind: "cond", stage })),
    ops: stages.slice(1).map((): Op => "and"),
    groups: [],
});

/** 이 항의 주소 — 조건은 `stage.id`, 참조는 항 id. */
export const idOf = (t: SetTerm): string => (t.kind === "cond" ? t.stage.id : t.id);

/** 참조 항 하나 — 다른 집합을 이 식에 끼운다. */
export const refNode = (setId: string): SetTerm => ({ kind: "ref", id: newNodeId(), setId });

// ── 모양 불변식 ────────────────────────────────────────────────────────────

/**
 * 구간이 온전한 괄호인가 — 길이 2 이상이라야 하고, 줄 전체를 덮는 괄호는 **NOT 이 있을 때만** 뜻이 있다.
 * (`NOT(a OR b OR c)` 는 뜻이 있고, `(a OR b OR c)` 는 줄 그 자체라 뜻이 없다.)
 */
const usableGroup = (g: Group, n: number): boolean =>
    g.to > g.from && (g.neg === true || !(g.from === 0 && g.to === n - 1));

/** 항 하나에 NOT 을 겹친다 — 두 번이면 상쇄(`not3(not3(x)) = x`, 3치에서도 정확). */
const xorNeg = (t: SetTerm, neg: boolean): SetTerm => {
    if (!neg) return t;
    if (t.neg === true) { const { neg: _drop, ...rest } = t; return rest as SetTerm; }
    return { ...t, neg: true };
};

/** 괄호 밖 경계들의 연산자 — 불변식 검사와 `topOpOf` 가 같은 자를 쓴다. */
const outsideOps = (ops: readonly Op[], groups: readonly Group[]): Op[] =>
    ops.filter((_, i) => !groups.some((g) => g.from <= i && i + 1 <= g.to));

/**
 * 한 겹이 성립하나 — **괄호 안도 밖도 연산자가 균일**해야 한다.
 *
 * ⚠ 이건 고른 제약이 아니라 **한 겹 + 숨은 우선순위 없음**의 귀결이다: `(a AND b OR c)` 는 읽는 법이
 * 둘이라(`((a AND b) OR c)` / `(a AND (b OR c))`) 안쪽 괄호 하나 더 없이는 뜻이 안 정해진다.
 */
export function oneLayerHolds(ops: readonly Op[], groups: readonly Group[]): boolean {
    for (const g of groups) for (let i = g.from; i < g.to; i++) if (ops[i] !== ops[g.from]) return false;
    const out = outsideOps(ops, groups);
    return out.every((o) => o === out[0]);
}

/**
 * 모양을 성립하게 다듬는다 — `ops` 길이 보정, 괄호 정렬·클램프·겹침 제거, 그리고 **불변식 강제**.
 * 편집 손이 전부 이걸 지나므로 깨진 식이 스토어에 못 들어간다.
 *
 * ⚠ **괄호를 항상 다시 친다**(`regroup`). 항이 줄면(`pruneTerms`·`parseExpr`) 남은 연산자가 섞인
 * 채 괄호만 사라질 수 있는데, 그러면 `foldExpr` 은 괄호 밖 첫 연산자 하나로 접고 나머지를 **버리고**
 * `renderExpr` 은 경계마다 제 연산자를 그려서 — **표시와 평가가 갈린다**. 이미 성립하는 모양은
 * `regroup` 이 그대로 재현하므로(멱등) 사용자가 고른 괄호는 안 바뀐다.
 */
export function normalizeExpr(e: SetExpr): SetExpr {
    const n = e.of.length;
    const want = Math.max(n - 1, 0);
    const ops = e.ops.length === want ? e.ops : Array.from({ length: want }, (_, i) => e.ops[i] ?? e.ops[e.ops.length - 1] ?? "and");
    let of = e.of;
    const sorted = [...e.groups]
        .map((g) => ({ ...g, from: Math.max(0, Math.min(g.from, n - 1)), to: Math.max(0, Math.min(g.to, n - 1)) }))
        .sort((a, b) => a.from - b.from);
    const cleaned: Group[] = [];
    for (const g of sorted) {
        if (cleaned.length > 0 && g.from <= cleaned[cleaned.length - 1]!.to) continue; // 겹침 — 뒤엣것을 버린다
        // ⚠ **한 항으로 줄어든 괄호는 접힌다 — NOT 은 그 항으로 내려앉는다.** 항이 빠지면(드래그가
        //   아니라 `removeTerm`·`activeExpr`·파싱 실패) 자연히 생기는 모양이고, 그냥 버리면 NOT 이
        //   조용히 증발한다. `NOT(NOT A)` = `A` 라 XOR 이 정확하다.
        if (g.to === g.from) {
            if (g.neg === true && of[g.from] !== undefined) {
                of = of === e.of ? [...of] : of;
                of[g.from] = xorNeg(of[g.from]!, true);
            }
            continue;
        }
        if (!usableGroup(g, n)) continue;
        cleaned.push(g);
    }
    // ⚠ 괄호는 **손의 것**이라 여기서 다시 치지 않는다 — 불변식이 깨진 채 들어오면(손으로 쓴 저장물)
    //   그때만 마지막 방어로 다시 친다. 정상 경로에서는 `setOpAt`·`toggleBoundaryGroup` 이 애초에
    //   깨지는 편집을 거절하므로 이 갈래가 안 돈다.
    const groups = oneLayerHolds(ops, cleaned) ? cleaned : regroup(of, ops, outsideOps(ops, cleaned)[0] ?? ops[0] ?? "and");
    const same = of === e.of && ops === e.ops && groups.length === e.groups.length
        && groups.every((g, i) => g.from === e.groups[i]!.from && g.to === e.groups[i]!.to && g.neg === e.groups[i]!.neg);
    return same ? e : { ...e, of, ops, groups };
}

/** 경계 `i`(항 i 와 i+1 사이)를 품은 괄호 — 없으면 null. */
export const groupAtBoundary = (e: SetExpr, i: number): Group | null =>
    e.groups.find((g) => g.from <= i && i + 1 <= g.to) ?? null;

/**
 * 괄호 **밖**의 연산자 — 줄 전체의 성질. 경계가 전부 괄호 안이거나 항이 하나면 `and`(무해한 기본).
 * 불변식 덕에 "괄호 밖 경계는 전부 같은 연산자"라 첫 하나만 보면 된다.
 */
export function topOpOf(e: SetExpr): Op {
    for (let i = 0; i < e.ops.length; i++) if (groupAtBoundary(e, i) === null) return e.ops[i]!;
    return "and";
}

/** 연산자 하나 — 경계 `i` 의 것. */
export const opAt = (e: SetExpr, i: number): Op => e.ops[i] ?? "and";

/**
 * 괄호를 다시 친다 — `top` 과 **다른** 연산자의 연속 구간을 전부 괄호로 묶는다.
 * 이 한 함수가 "숨은 우선순위 없음" 불변식의 전부다: 결과는 늘 한 겹이고, 괄호 밖은 전부 `top` 이다.
 */
function regroup(of: SetTerm[], ops: Op[], top: Op): Group[] {
    const groups: Group[] = [];
    let run = -1;
    for (let i = 0; i <= ops.length; i++) {
        const other = i < ops.length && ops[i] !== top;
        if (other && run < 0) run = i;
        if (!other && run >= 0) {
            groups.push({ from: run, to: i });
            run = -1;
        }
    }
    return groups.filter((g) => usableGroup(g, of.length));
}

/**
 * 연산자 바꾸기.
 *  · 괄호가 **하나도 없으면** 그 자리를 바깥으로 삼아 자동으로 박는다(`a AND b AND c` → `(a AND b) OR c`).
 *  · 괄호가 **이미 있으면** 손의 것이라 안 건드린다 — 그 변경이 한 겹을 깨면 **거절**한다(식이 안 바뀐다).
 *
 * ⚠ 거절이 자동 재괄호보다 낫다: 다시 치면 사람이 친 괄호와 **거기 걸린 NOT** 이 말없이 갈린다.
 */
export function setOpAt(e: SetExpr, i: number, op: Op): SetExpr {
    if (i < 0 || i >= e.ops.length || e.ops[i] === op) return e;
    const ops = e.ops.map((o, k) => (k === i ? op : o));
    if (e.groups.length === 0) return normalizeExpr({ ...e, ops, groups: regroup(e.of, ops, op) });
    if (!oneLayerHolds(ops, e.groups)) return e; // 거절 — 화면이 "괄호를 먼저 푸세요"라고 말한다
    return normalizeExpr({ ...e, ops });
}

/** 이 연산자를 바꿀 수 있나 — 화면이 판에서 회색으로 세우고 이유를 말할 재료. */
export const canSetOpAt = (e: SetExpr, i: number, op: Op): boolean =>
    i >= 0 && i < e.ops.length && (e.ops[i] === op || e.groups.length === 0
        || oneLayerHolds(e.ops.map((o, k) => (k === i ? op : o)), e.groups));

/**
 * **경계 토글** — 괄호 조작의 유일한 손이다(2026-09-22). 이 경계가
 *  · 괄호 **밖**이면 → 안으로 삼킨다(새 괄호 / 이웃 괄호 넓히기)
 *  · 괄호 **안**이면 → 거기서 자른다(쪼개기 / 풀기)
 *
 * 만들기·넓히기·자르기·풀기가 한 손짓 한 뜻으로 모인다. 한 겹을 깨거나 NOT 을 잃는 이동은 거절한다.
 */
export function toggleBoundaryGroup(e: SetExpr, i: number): SetExpr {
    if (i < 0 || i >= e.ops.length) return e;
    const inside = e.groups.find((g) => g.from <= i && i + 1 <= g.to);
    if (inside) {
        // ⚠ NOT 붙은 괄호는 **못 자른다** — 쪼개면 NOT 이 갈 곳이 없다(드모르간으로 분배하지 않는다).
        if (inside.neg === true) return e;
        const rest = e.groups.filter((g) => g !== inside);
        const left: Group = { from: inside.from, to: i };
        const right: Group = { from: i + 1, to: inside.to };
        return normalizeExpr({ ...e, groups: [...rest, left, right] });
    }
    const left = e.groups.find((g) => g.to === i);
    const right = e.groups.find((g) => g.from === i + 1);
    // 양옆이 다 괄호면 이어 붙이는 셈이라 두 NOT 을 합칠 길이 없다 — 거절한다.
    if (left && right) return e;
    const grown: Group = left ? { ...left, to: i + 1 } : right ? { ...right, from: i } : { from: i, to: i + 1 };
    const rest = e.groups.filter((g) => g !== left && g !== right);
    const next = [...rest, grown];
    if (!oneLayerHolds(e.ops, next)) return e; // 괄호 안이 섞인다 — 거절
    return normalizeExpr({ ...e, groups: next });
}

/**
 * ⚠ 옛 「이 자리를 바깥으로」(`promoteBoundary`)는 **이 하나에 흡수됐다**(2026-09-22): 섞인 줄에서
 * 괄호 안쪽을 자르면 한 겹을 지키느라 괄호가 반대쪽으로 옮겨간다 — `(a AND b) OR c` 의 AND 자리를
 * 자르면 `a AND (b OR c)` 다. 손잡이가 둘일 이유가 없다.
 */

/** 이 경계를 토글할 수 있나 — 화면이 회색 + 이유로 세울 재료. */
export const canToggleBoundary = (e: SetExpr, i: number): boolean => toggleBoundaryGroup(e, i) !== e;

/**
 * 괄호 통째로 풀기 — `from` 에서 시작하는 괄호를 없앤다.
 * ⚠ **NOT 이 붙어 있으면 거절**한다 — 풀면 NOT 이 갈 곳이 없다(드모르간으로 항에 분배하지 않는다).
 *   화면이 "NOT 을 먼저 떼세요"라고 말한다.
 */
export function removeGroupAt(e: SetExpr, from: number): SetExpr {
    const g = e.groups.find((x) => x.from === from);
    if (!g || g.neg === true) return e;
    return normalizeExpr({ ...e, groups: e.groups.filter((x) => x !== g) });
}

/** 괄호 부정 토글 — 경계 `i` 를 품은 괄호에 NOT 을 걸거나 뗀다. */
export function negateGroupAt(e: SetExpr, i: number): SetExpr {
    const g = e.groups.find((x) => x.from <= i && i + 1 <= x.to);
    if (!g) return e;
    const next = e.groups.map((x) => (x === g ? (x.neg === true ? { from: x.from, to: x.to } : { ...x, neg: true }) : x));
    return normalizeExpr({ ...e, groups: next });
}

/** 줄 전체를 한 연산자로 — 괄호가 통째로 사라진다(섞임이 없으면 괄호도 없다). */
export const setAllOps = (e: SetExpr, op: Op): SetExpr =>
    normalizeExpr({ ...e, ops: e.ops.map(() => op), groups: [] });

// ── 읽기 ──────────────────────────────────────────────────────────────────

/** 이 식이 쓰는 저장 집합 id 들(중복 제거) — 순환 검사·"쓰는 곳 N"·깨진 참조 표시의 재료. */
export function refsOf(e: SetExpr): string[] {
    const out = new Set<string>();
    for (const t of e.of) if (t.kind === "ref") out.add(t.setId);
    return [...out];
}

/**
 * 순환 참조인가 — `setId` 의 식이 `expr` 을 통해 자기 자신에 닿나. **저장 시 거절**의 자다.
 * 순환을 허용하면 평가가 무한히 내려가고, 드릴다운 줄 쌓임도 끝이 없다.
 */
export function hasCycle(setId: string, expr: SetExpr, exprOfSet: (id: string) => SetExpr | undefined): boolean {
    // ⚠ 방문표(visited)와 순환 판정을 **섞지 않는다** — 섞으면 다이아몬드(A → B → C, A → C)가
    //   순환으로 오판된다. 순환은 "자기 자신에 다시 닿는 것"뿐이고, 남을 두 번 지나는 건 정상이다.
    const visited = new Set<string>();
    const stack = [...refsOf(expr)];
    while (stack.length > 0) {
        const id = stack.pop()!;
        if (id === setId) return true;
        if (visited.has(id)) continue;
        visited.add(id);
        const e = exprOfSet(id);
        if (e) stack.push(...refsOf(e));
    }
    return false;
}

/**
 * 조건들 — **표시 순서 그대로**. 평평한 목록을 읽는 소비자 20여 곳이 이 투영 하나로 안 깨진다.
 *
 * ⚠ **참조는 잎이 아니다** — 그 안의 조건은 그 집합의 것이라 이 식의 조건 목록에 안 든다.
 *
 * ⚠ **결과를 식 객체에 메모한다(WeakMap)** — 이게 없으면 zustand 셀렉터가 호출마다 새 배열을 내고,
 * 얕은 비교가 늘 실패해 **스토어의 모든 갱신**이 그 소비자 전부를 깨운다.
 */
const leavesMemo = new WeakMap<SetExpr, FilterStage[]>();

export function leavesOf(e: SetExpr): FilterStage[] {
    const hit = leavesMemo.get(e);
    if (hit !== undefined) return hit;
    const out: FilterStage[] = [];
    for (const t of e.of) if (t.kind === "cond") out.push(t.stage);
    leavesMemo.set(e, out);
    return out;
}

/** 이 식이 든 조건 수 — 배열 없는 판. 참조는 안 센다. */
export function leafCount(e: SetExpr): number {
    let n = 0;
    for (const t of e.of) if (t.kind === "cond") n += 1;
    return n;
}

/**
 * 조건 갈아 끼우기 — `fn` 이 같은 객체를 돌려주면 **그 항은 참조가 유지된다**(React memo·얕은
 * 비교가 헛돌지 않게). 전부 그대로면 식 자체가 같은 객체다. 항 수가 안 바뀌므로 ops·groups 는 그대로.
 */
export function mapLeaves(e: SetExpr, fn: (s: FilterStage) => FilterStage): SetExpr {
    let changed = false;
    const of = e.of.map((t) => {
        if (t.kind !== "cond") return t;
        const next = fn(t.stage);
        if (next === t.stage) return t;
        changed = true;
        return { ...t, stage: next };
    });
    return changed ? { ...e, of } : e;
}

// ── 항 수를 바꾸는 유일한 두 길 ────────────────────────────────────────────

/**
 * 항을 걸러낸다 — **`ops`·`groups` 를 같이 옮기는 유일한 자리**.
 * 남는 항 앞의 연산자는 원본에서 그 항 바로 앞에 있던 것을 가져온다(줄의 성질을 지킨다).
 */
function pruneTerms(e: SetExpr, keep: (t: SetTerm) => boolean): SetExpr {
    const keepIdx: number[] = [];
    e.of.forEach((t, i) => { if (keep(t)) keepIdx.push(i); });
    if (keepIdx.length === e.of.length) return e;
    const of = keepIdx.map((i) => e.of[i]!);
    const ops: Op[] = [];
    for (let n = 1; n < keepIdx.length; n++) ops.push(e.ops[keepIdx[n]! - 1] ?? "and");
    const at = new Map<number, number>();
    keepIdx.forEach((old, next) => at.set(old, next));
    const groups: Group[] = [];
    for (const g of e.groups) {
        const inside = keepIdx.filter((i) => i >= g.from && i <= g.to).map((i) => at.get(i)!);
        // ⚠ 항이 하나만 남아도 **버리지 않는다** — 버리면 거기 걸린 NOT 이 조용히 증발한다.
        //   `normalizeExpr` 이 한 항짜리 괄호를 접으면서 NOT 을 그 항으로 내려앉힌다.
        if (inside.length >= 1) groups.push({ ...g, from: inside[0]!, to: inside[inside.length - 1]! });
    }
    return normalizeExpr({ ...e, of, ops, groups });
}

/**
 * 항 하나를 끝에 붙인다. 연산자를 안 주면 **줄의 바깥 연산자**를 따른다(새 항이 조용히 뜻을
 * 바꾸지 않게). 다른 연산자로 붙이면 `regroup` 이 그 자리에서 괄호를 만든다.
 */
export function appendTerm(e: SetExpr, t: SetTerm, op?: Op): SetExpr {
    const of = [...e.of, t];
    if (e.of.length === 0) return normalizeExpr({ ...e, of, ops: [], groups: [] });
    const use = op ?? topOpOf(e);
    const ops: Op[] = [...e.ops, use];
    const groups = op === undefined ? e.groups : regroup(of, ops, use);
    return normalizeExpr({ ...e, of, ops, groups });
}

/** 조건 하나를 끝에 붙인다. */
export const appendLeaf = (e: SetExpr, stage: FilterStage, op?: Op): SetExpr => appendTerm(e, { kind: "cond", stage }, op);

/** 항 삭제 — 루트는 비워질 뿐 안 사라진다. */
export const removeTerm = (e: SetExpr, id: string): SetExpr => pruneTerms(e, (t) => idOf(t) !== id);

/** 조건 걸러내기 — 참조는 조건 필터의 대상이 아니다(남의 것이다). */
export const filterLeaves = (e: SetExpr, keep: (s: FilterStage) => boolean): SetExpr =>
    pruneTerms(e, (t) => t.kind !== "cond" || keep(t.stage));

/**
 * **평가에 들어갈 식** — 꺼졌거나 술어가 빈 조건을 걷어낸다(`activeStages` 의 식 판).
 *
 * ⚠ 끄기는 **결손이 아니라 부재**다. AND 에서 빼면 느슨해지고 OR 에서 빼면 조여지는데, 그게 바로
 * "지우지 않고 빼보기"가 뜻하는 것이다. 재료가 없어서 판단 못 하는 결손(3치 undefined)과 섞지
 * 않는다 — 저건 평가 안에서 `and3`/`or3` 가 받는다.
 */
export const activeExpr = (e: SetExpr): SetExpr =>
    filterLeaves(e, (s) => s.enabled && s.predicates.some((p) => !isPredicateEmpty(p)));

// ── 항 편집(수를 안 바꾸는 것들) ───────────────────────────────────────────

/** 이 항이 부정돼 있나 — 부정은 **식의 것**이라 조건(FilterStage)이 아니라 여기서 묻는다. */
export function negOf(e: SetExpr, id: string): boolean {
    const t = findTerm(e, id);
    return t !== null && t.neg === true;
}

/** 항 하나를 찾는다(없으면 null). 짚은 자리가 지워졌는지 화면이 확인하는 자. */
export function findTerm(e: SetExpr, id: string): SetTerm | null {
    return e.of.find((t) => idOf(t) === id) ?? null;
}

/** 항 하나를 바꿔 끼운다 — 안 바뀐 항은 참조가 유지된다. */
export function replaceTerm(e: SetExpr, id: string, fn: (t: SetTerm) => SetTerm): SetExpr {
    let changed = false;
    const of = e.of.map((t) => {
        if (idOf(t) !== id) return t;
        const next = fn(t);
        if (next !== t) changed = true;
        return next;
    });
    return changed ? { ...e, of } : e;
}

/** 부정 토글 — 항에만 붙는다(부재 = 거짓이라 필드를 지운다). */
export const negateTerm = (e: SetExpr, id: string): SetExpr =>
    replaceTerm(e, id, (t) => {
        if (t.neg === true) { const { neg: _drop, ...rest } = t; return rest as SetTerm; }
        return { ...t, neg: true };
    });

// ── 접기 — 평평한 식 → 한 겹 트리 ──────────────────────────────────────────

/** 접힌 묶음 — 괄호 하나 또는 줄 전체. `kind` 가 항(`cond`/`ref`)과 겹치지 않아 갈린다. */
export interface FoldedNode {
    kind: Op;
    id: NodeId;
    of: FoldedItem[];
    /** 괄호의 NOT — 평가가 `not3` 로 받는다(루트 노드는 안 든다). */
    neg?: boolean;
}
export type FoldedItem = SetTerm | FoldedNode;

/** 접힌 것이 묶음인가 — 소비자(평가·표시)가 갈래를 가르는 자. */
export const isFoldedNode = (x: FoldedItem): x is FoldedNode => x.kind === "and" || x.kind === "or";

/**
 * 평평한 식 → **한 겹 트리**. 접는 규칙이 사는 유일한 곳이다("접는 것은 평가 때 한 번").
 *
 * ⚠ 평가도 표시도 전부 이걸 지나야 한다 — 두 곳에서 따로 접으면 같은 식이 화면과 평가에서
 * 다른 뜻이 된다(옛 "필터 UI 가 두 곳" 함정의 식 판).
 */
const foldMemo = new WeakMap<SetExpr, FoldedNode>();

export function foldExpr(e: SetExpr): FoldedNode {
    // ⚠ **식 객체에 메모한다**(WeakMap) — `evalExpr` 은 **항목마다** 불린다(종단 모수 1만 좌표).
    //   안 접어 두면 접기 비용과 배열 할당이 항목 수만큼 곱해진다(2026-09-21 실사용이 "AND/OR 을
    //   바꾸면 화면이 멈춘다"로 잡은 자리). 식은 편집마다 새 객체라 캐시가 낡을 수 없다.
    const hit = foldMemo.get(e);
    if (hit !== undefined) return hit;
    const top = topOpOf(e);
    const of: FoldedItem[] = [];
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
        });
        i = g.to + 1;
    }
    const made: FoldedNode = { kind: top, id: e.id, of };
    foldMemo.set(e, made);
    return made;
}

// ── 저장물 파싱 ────────────────────────────────────────────────────────────
//
// ⚠ **항 단위로 관대하다**. `parseStages` 는 술어 하나만 못 읽어도 저장본을 통째 버리는데, 식이
// 그 성질을 물려받으면 **항 하나가 깨졌을 때 집합 전체가 증발한다**. 그래서 여기서는 못 읽는
// 항만 떨어뜨리고 나머지는 산다(savedSets 목록의 항목 단위 관대와 같은 결).
//
// ⚠ 항이 떨어지면 `ops`·`groups` 가 어긋나는데, 그건 `normalizeExpr` 이 받아낸다 — 파서가 자기
// 손으로 맞추려 들면 규칙이 두 곳이 된다.

/** 술어 파싱은 stage.ts 의 규칙을 그대로 쓴다(scope 부재 = day 등의 승계가 거기 있다). */
type StageParser = (o: unknown) => FilterStage[] | null;

const parseOp = (v: unknown): Op => (v === "or" ? "or" : "and");

export function parseExpr(o: unknown, parseStages: StageParser): SetExpr | null {
    if (typeof o !== "object" || o === null) return null;
    const r = o as { id?: unknown; of?: unknown; ops?: unknown; groups?: unknown };
    if (!Array.isArray(r.of)) return null;
    const of: SetTerm[] = [];
    /** 살아남은 항의 **원래 자리** — 연산자·괄호를 그 자리 기준으로 되짚는다. */
    const from: number[] = [];
    r.of.forEach((raw, i) => {
        if (typeof raw !== "object" || raw === null) return;
        const t = raw as { kind?: unknown; neg?: unknown; id?: unknown; stage?: unknown; setId?: unknown };
        const neg = t.neg === true ? { neg: true as const } : {};
        if (t.kind === "cond") {
            // 항은 **단계 하나짜리 배열**로 파싱한다 — 술어 승계 규칙이 거기 있다.
            const one = parseStages([t.stage]);
            if (one && one.length === 1) { of.push({ kind: "cond", stage: one[0]!, ...neg }); from.push(i); }
            return;
        }
        if (t.kind === "ref") {
            // 가리키는 집합이 **아직 있는지는 안 본다** — 그건 리졸버의 일이고, 화면이
            // "깨진 참조 + 라벨"로 받는다(조용한 폴백 금지 규칙과 같은 자리).
            if (typeof t.setId !== "string" || t.setId === "") return;
            of.push({ kind: "ref", id: typeof t.id === "string" && t.id !== "" ? t.id : newNodeId(), setId: t.setId, ...neg });
            from.push(i);
        }
    });
    const rawOps = Array.isArray(r.ops) ? r.ops : [];
    const ops: Op[] = [];
    for (let n = 1; n < from.length; n++) ops.push(parseOp(rawOps[from[n]! - 1]));
    const at = new Map<number, number>();
    from.forEach((old, next) => at.set(old, next));
    const groups: Group[] = [];
    for (const raw of Array.isArray(r.groups) ? r.groups : []) {
        if (typeof raw !== "object" || raw === null) continue;
        const g = raw as { from?: unknown; to?: unknown; neg?: unknown };
        if (typeof g.from !== "number" || typeof g.to !== "number") continue;
        const lo = g.from;
        const hi = g.to;
        const inside = from.filter((i) => i >= lo && i <= hi).map((i) => at.get(i)!);
        // ⚠ 항이 하나만 남아도 **버리지 않는다** — `normalizeExpr` 이 NOT 을 그 항으로 내려앉힌다.
        if (inside.length >= 1) {
            groups.push({ from: inside[0]!, to: inside[inside.length - 1]!, ...((g as { neg?: unknown }).neg === true ? { neg: true as const } : {}) });
        }
    }
    return normalizeExpr({ id: typeof r.id === "string" && r.id !== "" ? r.id : ROOT_ID, of, ops, groups });
}
