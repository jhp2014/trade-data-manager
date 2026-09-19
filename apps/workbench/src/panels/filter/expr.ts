// 집합의 **식**(순수) — 조건 한 벌이 리스트에서 트리가 된 자리. 규칙 전문은
// `.claude/decisions.md` 「집합 편성 재설계」.
//
//   집합 = 이름 + 식
//   식   = ¬? 조건 | ¬? AND(식…) | ¬? OR(식…)
//
// ## 참조 잎 — **이름이 곧 중첩의 수단**이다
// `∈ 집합` 은 다른 저장 집합을 통째로 한 잎으로 세운다. 그래서 깊이는 이름이 만들고(승격),
// 익명 묶음은 "아직 이름값을 못 한 구조"로 남는다. 옛 조립은 OR(참조…) 로 승계된다.
//
// ⚠ **참조는 그 자리에서 못 고친다** — 고치면 그 집합을 쓰는 다른 식이 전부 따라 바뀐다.
// 편집하려면 그 집합을 **열어야** 한다(편집 대상 전환). 순환 참조는 저장 시 거절한다(무한 평가).
//
// ## 부정은 노드가 아니라 **수식어**다
// `not(not(x))` 같은 사슬이 생기지 않게 `neg?: boolean` 을 각 형태에 단다(부재 = 거짓). 저장물에서도
// 없으면 없는 대로 읽히므로 옛 저장물 승계가 필드 추가 없이 성립한다.
//
// ## 순서는 **표시**만 정한다
// 3치 AND/OR 은 교환법칙이 성립하고(2026-09-19 5칸 진단 은퇴로 순서가 만들던 서술이 사라졌다),
// 하루 우주의 **평가** 순서는 엔진이 비용 오름차순으로 따로 정한다. 그래서 여기 배열 순서는
// 화면에 세우는 순서일 뿐이다.
import { isPredicateEmpty, type FilterStage } from "./stage.js";

/** 묶음 노드의 식별자 — 짚은 노드·삽입 지점이 이 id 를 주소로 쓴다(7단계). 잎의 주소는 `stage.id`. */
export type NodeId = string;

interface Negatable {
    /** 부정 — 부재 = 거짓. `not3` 규칙이라 **결손의 부정은 결손**이다(모름을 뒤집어도 모름). */
    neg?: boolean;
}

export type SetExpr =
    | ({ kind: "cond"; stage: FilterStage } & Negatable)
    /** 다른 저장 집합 한 벌 — 내용은 그 집합의 것이고, 여기선 멤버십만 묻는다. */
    | ({ kind: "ref"; id: NodeId; setId: string } & Negatable)
    | ({ kind: "and"; id: NodeId; of: SetExpr[] } & Negatable)
    | ({ kind: "or"; id: NodeId; of: SetExpr[] } & Negatable);

/** 묶음 노드 id 발급 — 잎(stage.id)과 이름공간을 가른다(`n…` vs `s…`). */
let nodeSeq = 0;
export const newNodeId = (): NodeId => `n${Date.now().toString(36)}${(nodeSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 루트 id — 승계·빈 식이 늘 같은 자리를 갖게 고정한다(아무도 주소로 안 쓰지만 diff 가 안정된다). */
export const ROOT_ID = "root";

/** 빈 식 — 조건 0개. "제한 없음"이지 "전부 탈락"이 아니다(소비자는 isFiltering 으로 가른다). */
export const emptyExpr = (): SetExpr => ({ kind: "and", id: ROOT_ID, of: [] });

/** 평평한 조건 리스트 → 루트 AND. 옛 저장물 승계와 "지금까지의 화면"이 같은 함수를 지난다. */
export const exprOfStages = (stages: readonly FilterStage[]): SetExpr =>
    ({ kind: "and", id: ROOT_ID, of: stages.map((stage): SetExpr => ({ kind: "cond", stage })) });

/** 묶음인가 — `of` 를 가진 노드(타입 좁히기 헬퍼). */
export const isGroup = (e: SetExpr): e is Extract<SetExpr, { of: SetExpr[] }> => e.kind === "and" || e.kind === "or";

/** 이 식이 쓰는 저장 집합 id 들(중복 제거) — 순환 검사·"쓰는 곳 N"·깨진 참조 표시의 재료. */
export function refsOf(e: SetExpr): string[] {
    const out = new Set<string>();
    const walk = (n: SetExpr): void => {
        if (n.kind === "ref") { out.add(n.setId); return; }
        if (!isGroup(n)) return;
        for (const c of n.of) walk(c);
    };
    walk(e);
    return [...out];
}

/**
 * 순환 참조인가 — `setId` 의 식이 `expr` 을 통해 자기 자신에 닿나. **저장 시 거절**의 자다.
 * 순환을 허용하면 평가가 무한히 내려가고, 드릴다운 빵부스러기도 끝이 없다.
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
 * 잎(조건)들 — **표시 순서 그대로**. 평평한 목록을 읽는 소비자 20여 곳이 이 투영 하나로 안 깨진다
 * (`selectFilterStages`). 그래서 이 함수의 순서 계약은 "화면에 세운 순서"다.
 *
 * ⚠ **결과를 식 객체에 메모한다(WeakMap)** — 이게 없으면 zustand 셀렉터(`selectFilterStages`)가
 * 호출마다 새 배열을 내고, 얕은 비교가 늘 실패해 **스토어의 모든 갱신**이 그 소비자 전부를 깨운다
 * (decisions.md 「허용 폭 T」 ⚠ 항목이 시트 전량 재정렬로 겪은 그 사고). 식은 편집마다 새 객체라
 * 캐시가 낡을 수 없고, WeakMap 이라 옛 식은 GC 가 가져간다.
 */
const leavesMemo = new WeakMap<SetExpr, FilterStage[]>();

export function leavesOf(e: SetExpr): FilterStage[] {
    const hit = leavesMemo.get(e);
    if (hit !== undefined) return hit;
    const out: FilterStage[] = [];
    const walk = (n: SetExpr): void => {
        if (n.kind === "cond") { out.push(n.stage); return; }
        // ⚠ 참조는 **잎이 아니다** — 그 안의 조건은 그 집합의 것이라 이 식의 조건 목록에 안 든다.
        //   여기서 펼치면 "이 집합의 조건 N개"가 남의 조건까지 세고, 편집면이 남의 것을 만지게 된다.
        if (!isGroup(n)) return;
        for (const c of n.of) walk(c);
    };
    walk(e);
    leavesMemo.set(e, out);
    return out;
}

/** 이 식이 든 잎 수 — leavesOf().length 의 배열 없는 판(자주 불리는 자리에서 쓰레기를 안 만든다). */
export function leafCount(e: SetExpr): number {
    if (e.kind === "cond") return 1;
    if (!isGroup(e)) return 0; // 참조는 조건 수에 안 든다(위 leavesOf 와 같은 이유)
    let n = 0;
    for (const c of e.of) n += leafCount(c);
    return n;
}

/**
 * 잎 갈아 끼우기 — `fn` 이 같은 객체를 돌려주면 **그 가지는 참조가 유지된다**(React memo·얕은 비교가
 * 헛돌지 않게). 전부 그대로면 식 자체가 같은 객체다.
 */
export function mapLeaves(e: SetExpr, fn: (s: FilterStage) => FilterStage): SetExpr {
    if (e.kind === "cond") {
        const next = fn(e.stage);
        return next === e.stage ? e : { ...e, stage: next };
    }
    if (!isGroup(e)) return e;
    let changed = false;
    const of = e.of.map((c) => {
        const n = mapLeaves(c, fn);
        if (n !== c) changed = true;
        return n;
    });
    return changed ? { ...e, of } : e;
}

/**
 * 잎 걸러내기 — 거짓을 돌려준 잎이 빠진다. **빈 묶음은 같이 접힌다**(루트는 남는다): 잎이 없어진
 * 묶음을 남기면 화면에 뜻 없는 껍데기가 서고, 평가에서도 AND 는 공허참·OR 은 공허거짓이라
 * 남겨 둘 이유가 없다.
 */
export function filterLeaves(e: SetExpr, keep: (s: FilterStage) => boolean): SetExpr {
    const walk = (n: SetExpr): SetExpr | null => {
        if (n.kind === "cond") return keep(n.stage) ? n : null;
        if (!isGroup(n)) return n; // 참조는 조건 필터의 대상이 아니다(내용이 남의 것이다)
        const of = n.of.map(walk).filter((c): c is SetExpr => c !== null);
        if (of.length === 0) return null;
        return of.length === n.of.length && of.every((c, i) => c === n.of[i]) ? n : { ...n, of };
    };
    return walk(e) ?? emptyExpr();
}

/** 잎 하나를 루트에 붙인다 — 루트가 묶음이 아닐 수는 없다(파서가 보장). */
export function appendLeaf(e: SetExpr, stage: FilterStage): SetExpr {
    if (!isGroup(e)) return { kind: "and", id: ROOT_ID, of: [e, { kind: "cond", stage }] };
    return { ...e, of: [...e.of, { kind: "cond", stage }] };
}

/**
 * **평가에 들어갈 식** — 꺼졌거나 술어가 빈 잎을 걷어낸다(`activeStages` 의 트리 판).
 *
 * ⚠ 끄기는 **결손이 아니라 부재**다. AND 에서 빼면 느슨해지고 OR 에서 빼면 조여지는데, 그게 바로
 * "지우지 않고 빼보기"가 뜻하는 것이다(OR(a,b) 에서 b 를 끄면 a 만 남는 게 맞다). 재료가 없어서
 * 판단 못 하는 결손(3치 undefined)과 섞지 않는다 — 저건 평가 안에서 `and3`/`or3` 가 받는다.
 */
export const activeExpr = (e: SetExpr): SetExpr =>
    filterLeaves(e, (s) => s.enabled && s.predicates.some((p) => !isPredicateEmpty(p)));

// ── 노드 편집(7단계 — 편집면이 쓰는 자들) ─────────────────────────────────
//
// 주소는 **노드 id** 하나다: 잎은 `stage.id`, 묶음은 `id`. 편집면은 "짚은 노드"를 그 id 로 들고,
// 삽입·부정·연산자 토글·삭제가 전부 같은 주소를 쓴다.

/** 이 잎이 부정돼 있나 — 부정은 **식의 것**이라 조건(FilterStage)이 아니라 여기서 묻는다. */
export function negOf(e: SetExpr, id: string): boolean {
    const n = findNode(e, id);
    return n !== null && n.neg === true;
}

/** 이 노드의 주소 — 잎은 조건 id, 묶음은 노드 id. */
export const idOf = (e: SetExpr): string => (e.kind === "cond" ? e.stage.id : e.id);

/** 참조 잎 하나 — 승격(이름 붙이기)과 조립 승계가 같은 자를 쓴다. */
export const refNode = (setId: string): SetExpr => ({ kind: "ref", id: newNodeId(), setId });

/** 트리에서 노드 하나를 찾는다(없으면 null). 짚은 노드가 지워졌는지 화면이 확인하는 자. */
export function findNode(e: SetExpr, id: string): SetExpr | null {
    if (idOf(e) === id) return e;
    if (!isGroup(e)) return null;
    for (const c of e.of) {
        const hit = findNode(c, id);
        if (hit !== null) return hit;
    }
    return null;
}

/** 노드 하나를 바꿔 끼운다 — 안 바뀐 가지는 참조가 유지된다. */
export function replaceNode(e: SetExpr, id: string, fn: (n: SetExpr) => SetExpr): SetExpr {
    if (idOf(e) === id) return fn(e);
    if (!isGroup(e)) return e;
    let changed = false;
    const of = e.of.map((c) => {
        const n = replaceNode(c, id, fn);
        if (n !== c) changed = true;
        return n;
    });
    return changed ? { ...e, of } : e;
}

/** 부정 토글 — 잎·묶음 어디에나 붙는다(부재 = 거짓이라 필드를 지운다). */
export const negateNode = (e: SetExpr, id: string): SetExpr =>
    replaceNode(e, id, (n) => {
        if (n.neg === true) { const { neg: _drop, ...rest } = n; return rest as SetExpr; }
        return { ...n, neg: true };
    });

/** 연산자 토글(AND ↔ OR) — 묶음에만. 잎을 누르면 아무 일도 안 난다. */
export const toggleOperator = (e: SetExpr, id: string): SetExpr =>
    replaceNode(e, id, (n) => (isGroup(n) ? { ...n, kind: n.kind === "and" ? "or" : "and" } as SetExpr : n));

/** 노드 삭제 — 빈 묶음은 같이 접힌다(filterLeaves 와 같은 규칙). 루트는 비워질 뿐 안 사라진다. */
export function removeNode(e: SetExpr, id: string): SetExpr {
    if (idOf(e) === id) return emptyExpr();
    const walk = (n: SetExpr): SetExpr | null => {
        if (idOf(n) === id) return null;
        if (!isGroup(n)) return n;
        const of = n.of.map(walk).filter((c): c is SetExpr => c !== null);
        if (of.length === 0) return null;
        return of.length === n.of.length && of.every((c, i) => c === n.of[i]) ? n : { ...n, of };
    };
    return walk(e) ?? emptyExpr();
}

/**
 * 조건 붙이기 — **괄호를 손으로 치지 않게 하는 자**다.
 *
 *  · `mode === "and"` — 짚은 노드가 AND 면 그 안에 붙인다. 아니면(OR·잎) 그 자리를 **AND 묶음으로
 *    감싸고** 둘을 담는다.
 *  · `mode === "or"`  — 대칭. 짚은 노드가 OR 면 그 안에, 아니면 OR 묶음으로 감싼다.
 *
 * 그래서 사용자는 "AND 로 추가 / OR 로 추가" 둘만 고르고, 중첩은 그 결과로 생긴다.
 * 짚은 노드가 없거나(null) 트리에 없으면 루트에 붙인다.
 */
export function addNodeAt(e: SetExpr, at: string | null, leaf: SetExpr, mode: "and" | "or"): SetExpr {
    const target = at !== null && findNode(e, at) !== null ? at : idOf(e);
    return replaceNode(e, target, (n) => {
        if (n.kind === mode) return { ...n, of: [...n.of, leaf] };
        // ⚠ **빈 묶음은 감싸지 않는다** — 조건을 다 비운 뒤 `OR 로 추가` 가 켜져 있으면
        //   `OR(AND(), 새것)` 이 생긴다. 평가는 `activeExpr` 이 빈 묶음을 걷어 멀쩡하지만,
        //   화면에는 "모두 · 0" 짜리 유령 묶음이 서고 사용자는 안 만든 구조를 본다.
        //   감쌀 것이 없으면 그냥 넣는다(뜻은 "그 조건 하나" 로 같다).
        if (isGroup(n) && n.of.length === 0) return { ...n, of: [leaf] };
        // 자리를 묶음으로 감싼다 — 감싸는 묶음은 **부정을 안 물려받는다**(¬(a) 를 ¬(a ∧ b) 로 바꾸면
        // 사용자가 건 적 없는 뜻이 된다). 부정은 감싸인 노드에 그대로 남는다.
        return { kind: mode, id: newNodeId(), of: [n, leaf] };
    });
}

/** 조건 붙이기 — `addNodeAt` 의 조건 갈래(옛 이름 유지: 호출부가 셋이다). */
export const addLeafAt = (e: SetExpr, at: string | null, stage: FilterStage, mode: "and" | "or"): SetExpr =>
    addNodeAt(e, at, { kind: "cond", stage }, mode);

// ── 저장물 파싱 ────────────────────────────────────────────────────────────
//
// ⚠ **잎 단위로 관대하다**(2026-09-19 확정). `parseStages` 는 술어 하나만 못 읽어도 저장본을 통째
// 버리는데, 트리에서 그 성질을 물려받으면 **잎 하나가 깨졌을 때 집합 전체가 증발한다**. 그래서
// 여기서는 못 읽는 잎만 떨어뜨리고 나머지는 산다(savedSets 목록의 항목 단위 관대와 같은 결).

/** 잎 하나 파싱 — 모양이 안 맞으면 null(그 잎만 버린다). 술어 파싱은 stage.ts 의 규칙을 그대로 쓴다. */
type StageParser = (o: unknown) => FilterStage[] | null;

export function parseExpr(o: unknown, parseStages: StageParser): SetExpr | null {
    const walk = (n: unknown): SetExpr | null => {
        if (typeof n !== "object" || n === null) return null;
        const r = n as { kind?: unknown; neg?: unknown; id?: unknown; of?: unknown; stage?: unknown; setId?: unknown };
        const neg = r.neg === true ? { neg: true as const } : {};
        if (r.kind === "cond") {
            // 잎은 **단계 하나짜리 배열**로 파싱한다 — 술어 승계 규칙(scope 부재 = day 등)이 거기 있다.
            const one = parseStages([r.stage]);
            return one && one.length === 1 ? { kind: "cond", stage: one[0]!, ...neg } : null;
        }
        if (r.kind === "ref") {
            // 가리키는 집합이 **아직 있는지는 안 본다** — 그건 리졸버의 일이고, 화면이
            // "깨진 참조 + 라벨"로 받는다(조용한 폴백 금지 규칙과 같은 자리).
            if (typeof r.setId !== "string" || r.setId === "") return null;
            return { kind: "ref", id: typeof r.id === "string" && r.id !== "" ? r.id : newNodeId(), setId: r.setId, ...neg };
        }
        if (r.kind !== "and" && r.kind !== "or") return null;
        const of = (Array.isArray(r.of) ? r.of : []).map(walk).filter((c): c is SetExpr => c !== null);
        const id = typeof r.id === "string" && r.id !== "" ? r.id : newNodeId();
        return { kind: r.kind, id, of, ...neg };
    };
    const e = walk(o);
    // 루트는 묶음이어야 한다 — 잎 하나짜리 루트가 오면 AND 로 감싼다(붙이기·비우기가 늘 성립하게).
    if (e === null) return null;
    return isGroup(e) ? e : { kind: "and", id: ROOT_ID, of: [e] };
}
