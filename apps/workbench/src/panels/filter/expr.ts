// 집합의 **식**(순수) — **한 층**이다. 규칙 전문은 `.claude/decisions.md` 「집합 편성 — 묶음은 곧
// 이름 붙은 집합」.
//
//   집합 = 이름 + 식
//   식   = 연산자 하나(AND | OR) + 항들
//   항   = NOT? 조건 | NOT? 참조
//
// ## 중첩은 식 안이 아니라 **집합 사이**에 있다
// 묶음이 곧 저장 집합이므로, 안쪽 묶음은 그 자리에 **참조**로 선다. 그래서 식에 `and` 안의 `and`
// 같은 노드가 없고, **괄호가 원리적으로 생기지 않는다**(한 층에 연산자가 하나뿐이다).
// 표현력은 안 준다 — `(a AND b) OR c` 의 `a AND b` 가 이름 붙은 집합이 될 뿐이다.
//
// ⚠ **참조는 그 자리에서 못 고친다** — 고치면 그 집합을 쓰는 다른 식이 전부 따라 바뀐다.
// 편집하려면 그 집합을 **열어야** 한다(편집 대상 전환). 순환 참조는 저장 시 거절한다(무한 평가).
//
// ## 부정은 노드가 아니라 **수식어**다
// `NOT(NOT(x))` 같은 사슬이 생기지 않게 `neg?: boolean` 을 항에 단다(부재 = 거짓).
// **루트는 부정을 안 든다** — 집합 자체의 부정은 그 집합을 참조하는 쪽에서 `NOT ∈` 으로 건다.
//
// ## 순서는 **표시**만 정한다
// 3치 AND/OR 은 교환법칙이 성립하고, 하루 우주의 **평가** 순서는 엔진이 비용 오름차순으로 따로
// 정한다. 그래서 여기 배열 순서는 화면에 세우는 순서일 뿐이다.
import { isPredicateEmpty, type FilterStage } from "./stage.js";

/** 항의 식별자 — 짚은 자리·편집면이 이 id 를 주소로 쓴다. 조건 항의 주소는 `stage.id`. */
export type NodeId = string;

interface Negatable {
    /** 부정 — 부재 = 거짓. `not3` 규칙이라 **결손의 부정은 결손**이다(모름을 뒤집어도 모름). */
    neg?: boolean;
}

/** 항 하나 — 조건이거나 다른 집합 한 벌. 중첩은 **참조로** 간다(식 안에 묶음이 없다). */
export type SetTerm =
    | ({ kind: "cond"; stage: FilterStage } & Negatable)
    /** 다른 저장 집합 한 벌 — 내용은 그 집합의 것이고, 여기선 멤버십만 묻는다. */
    | ({ kind: "ref"; id: NodeId; setId: string } & Negatable);

/** 집합의 식 — 연산자 하나 + 항들. **한 묶음 = 한 연산자**(모두 / 하나라도). */
export interface SetExpr {
    kind: "and" | "or";
    id: NodeId;
    of: SetTerm[];
}

/** 항 id 발급 — 조건 항의 주소(`stage.id`, `s…`)와 이름공간을 가른다(`n…`). */
let nodeSeq = 0;
export const newNodeId = (): NodeId => `n${Date.now().toString(36)}${(nodeSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 루트 id — 빈 식이 늘 같은 자리를 갖게 고정한다(아무도 주소로 안 쓰지만 diff 가 안정된다). */
export const ROOT_ID = "root";

/** 빈 식 — 조건 0개. "제한 없음"이지 "전부 탈락"이 아니다(소비자는 isFiltering 으로 가른다). */
export const emptyExpr = (): SetExpr => ({ kind: "and", id: ROOT_ID, of: [] });

/** 조건 리스트 → AND 한 벌. 테스트·기본값이 쓰는 지름길. */
export const exprOfStages = (stages: readonly FilterStage[]): SetExpr =>
    ({ kind: "and", id: ROOT_ID, of: stages.map((stage): SetTerm => ({ kind: "cond", stage })) });

/** 이 항의 주소 — 조건은 `stage.id`, 참조는 항 id. */
export const idOf = (t: SetTerm): string => (t.kind === "cond" ? t.stage.id : t.id);

/** 참조 항 하나 — 다른 집합을 이 식에 끼운다. */
export const refNode = (setId: string): SetTerm => ({ kind: "ref", id: newNodeId(), setId });

/** 이 식이 쓰는 저장 집합 id 들(중복 제거) — 순환 검사·"쓰는 곳 N"·깨진 참조 표시의 재료. */
export function refsOf(e: SetExpr): string[] {
    const out = new Set<string>();
    for (const t of e.of) if (t.kind === "ref") out.add(t.setId);
    return [...out];
}

/**
 * 순환 참조인가 — `setId` 의 식이 `expr` 을 통해 자기 자신에 닿나. **저장 시 거절**의 자다.
 * 순환을 허용하면 평가가 무한히 내려가고, 드릴다운 빵부스러기도 끝이 없다.
 *
 * ⚠ 중첩이 전부 참조가 된 뒤로 이 검사가 **더 중요해졌다** — 옛 모델에선 참조가 드물었다.
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
 * 조건들 — **표시 순서 그대로**. 평평한 목록을 읽는 소비자 20여 곳이 이 투영 하나로 안 깨진다
 * (`selectFilterStages`).
 *
 * ⚠ **참조는 잎이 아니다** — 그 안의 조건은 그 집합의 것이라 이 식의 조건 목록에 안 든다.
 * 여기서 펼치면 "이 집합의 조건 N개"가 남의 조건까지 세고, 편집면이 남의 것을 만지게 된다.
 *
 * ⚠ **결과를 식 객체에 메모한다(WeakMap)** — 이게 없으면 zustand 셀렉터(`selectFilterStages`)가
 * 호출마다 새 배열을 내고, 얕은 비교가 늘 실패해 **스토어의 모든 갱신**이 그 소비자 전부를 깨운다.
 * 식은 편집마다 새 객체라 캐시가 낡을 수 없고, WeakMap 이라 옛 식은 GC 가 가져간다.
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

/** 이 식이 든 조건 수 — 배열 없는 판(자주 불리는 자리에서 쓰레기를 안 만든다). 참조는 안 센다. */
export function leafCount(e: SetExpr): number {
    let n = 0;
    for (const t of e.of) if (t.kind === "cond") n += 1;
    return n;
}

/**
 * 조건 갈아 끼우기 — `fn` 이 같은 객체를 돌려주면 **그 항은 참조가 유지된다**(React memo·얕은
 * 비교가 헛돌지 않게). 전부 그대로면 식 자체가 같은 객체다.
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

/** 조건 걸러내기 — 거짓을 돌려준 조건이 빠진다. 참조는 조건 필터의 대상이 아니다(남의 것이다). */
export function filterLeaves(e: SetExpr, keep: (s: FilterStage) => boolean): SetExpr {
    const of = e.of.filter((t) => t.kind !== "cond" || keep(t.stage));
    return of.length === e.of.length ? e : { ...e, of };
}

/** 항 하나를 끝에 붙인다. */
export const appendTerm = (e: SetExpr, t: SetTerm): SetExpr => ({ ...e, of: [...e.of, t] });

/** 조건 하나를 끝에 붙인다. */
export const appendLeaf = (e: SetExpr, stage: FilterStage): SetExpr => appendTerm(e, { kind: "cond", stage });

/**
 * **평가에 들어갈 식** — 꺼졌거나 술어가 빈 조건을 걷어낸다(`activeStages` 의 식 판).
 *
 * ⚠ 끄기는 **결손이 아니라 부재**다. AND 에서 빼면 느슨해지고 OR 에서 빼면 조여지는데, 그게 바로
 * "지우지 않고 빼보기"가 뜻하는 것이다. 재료가 없어서 판단 못 하는 결손(3치 undefined)과 섞지
 * 않는다 — 저건 평가 안에서 `and3`/`or3` 가 받는다.
 */
export const activeExpr = (e: SetExpr): SetExpr =>
    filterLeaves(e, (s) => s.enabled && s.predicates.some((p) => !isPredicateEmpty(p)));

// ── 항 편집 ────────────────────────────────────────────────────────────────
//
// 주소는 **항 id** 하나다: 조건은 `stage.id`, 참조는 항 `id`.

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

/** 연산자 토글(AND ↔ OR) — **식 전체**의 것이다(한 묶음 = 한 연산자). */
export const toggleOperator = (e: SetExpr): SetExpr => ({ ...e, kind: e.kind === "and" ? "or" : "and" });

/** 항 삭제 — 루트는 비워질 뿐 안 사라진다. */
export const removeTerm = (e: SetExpr, id: string): SetExpr => {
    const of = e.of.filter((t) => idOf(t) !== id);
    return of.length === e.of.length ? e : { ...e, of };
};

// ── 저장물 파싱 ────────────────────────────────────────────────────────────
//
// ⚠ **항 단위로 관대하다**. `parseStages` 는 술어 하나만 못 읽어도 저장본을 통째 버리는데, 식이
// 그 성질을 물려받으면 **항 하나가 깨졌을 때 집합 전체가 증발한다**. 그래서 여기서는 못 읽는
// 항만 떨어뜨리고 나머지는 산다(savedSets 목록의 항목 단위 관대와 같은 결).

/** 술어 파싱은 stage.ts 의 규칙을 그대로 쓴다(scope 부재 = day 등의 승계가 거기 있다). */
type StageParser = (o: unknown) => FilterStage[] | null;

export function parseExpr(o: unknown, parseStages: StageParser): SetExpr | null {
    if (typeof o !== "object" || o === null) return null;
    const r = o as { kind?: unknown; id?: unknown; of?: unknown };
    if (r.kind !== "and" && r.kind !== "or") return null;
    const of: SetTerm[] = [];
    for (const raw of Array.isArray(r.of) ? r.of : []) {
        if (typeof raw !== "object" || raw === null) continue;
        const t = raw as { kind?: unknown; neg?: unknown; id?: unknown; stage?: unknown; setId?: unknown };
        const neg = t.neg === true ? { neg: true as const } : {};
        if (t.kind === "cond") {
            // 항은 **단계 하나짜리 배열**로 파싱한다 — 술어 승계 규칙이 거기 있다.
            const one = parseStages([t.stage]);
            if (one && one.length === 1) of.push({ kind: "cond", stage: one[0]!, ...neg });
            continue;
        }
        if (t.kind === "ref") {
            // 가리키는 집합이 **아직 있는지는 안 본다** — 그건 리졸버의 일이고, 화면이
            // "깨진 참조 + 라벨"로 받는다(조용한 폴백 금지 규칙과 같은 자리).
            if (typeof t.setId !== "string" || t.setId === "") continue;
            of.push({ kind: "ref", id: typeof t.id === "string" && t.id !== "" ? t.id : newNodeId(), setId: t.setId, ...neg });
        }
    }
    return { kind: r.kind, id: typeof r.id === "string" && r.id !== "" ? r.id : ROOT_ID, of };
}
