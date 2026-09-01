// 그룹 목록의 줄 만들기(순수) — 계층 펴기 · 겹침순 세우기 · 체인과의 관계 판정.
//
// 이 목록이 맵을 대신한다. 맵이 그림으로 나르던 것과 이 목록의 대응은 이렇다:
//   · 포함관계(영역 중첩)  → **들여쓰기**
//   · 겹침 선 + 숫자 크기  → **`& 체인` 열**(값이 정확하고 정렬까지 된다)
//   · 교집합 칩            → 머리줄의 "공통 N"
// 맵이 못 옮기는 건 하나뿐이다: 손으로 놓은 자리(공간 기억). 그건 그룹이 아니라 항목을 놓는 판
// (유사도 맵)의 본론이라 여기서 잃는 게 아니다.
import type { Group } from "../../api/groups.js";
import { isAncestorOf } from "../../lib/groupTree.js";

/** 목록의 한 줄 — 그룹 하나와 그리기에 필요한 것(깊이·자식 유무). */
export interface GroupRow {
    group: Group;
    /** 들여쓰기 칸수. 겹침순에서는 전부 0(계층을 접고 값으로 세우는 화면이다). */
    depth: number;
    hasChildren: boolean;
}

/**
 * 체인과 이 그룹의 관계 — `&` 칸에 무엇을 적을지가 여기서 갈린다.
 *   · `chain`   = 체인에 든 것("짚음")
 *   · `contain` = 체인 멤버의 조상이거나 자손("포함"). **좁혀지지 않는 걸음**이라 수가 뜻이 없다:
 *                 조상과 교집합을 내면 체인이 그대로고, 자손이면 그 자손의 수가 그대로다.
 *                 맵은 이런 후보를 아예 안 그렸는데(포함은 영역이 보여준다), 목록은 트리라서 행을
 *                 숨길 수 없다 — 대신 왜 무의미한지 말해 준다.
 *   · `other`   = 갈 수 있는 곳(또는 0).
 */
export type ChainRelation = "chain" | "contain" | "other";

export function relationOf(
    name: string,
    chain: readonly string[],
    groupByName: ReadonlyMap<string, Group>,
): ChainRelation {
    if (chain.includes(name)) return "chain";
    for (const c of chain) {
        if (isAncestorOf(name, c, groupByName) || isAncestorOf(c, name, groupByName)) return "contain";
    }
    return "other";
}

/**
 * 계층 순서로 편 줄 — 부모 바로 밑에 자식이 붙는다. 형제는 이름순(서버 정렬을 그대로 탄다).
 *
 * ⚠ 부모가 사전에 없는 그룹(지워짐·아직 안 온 캐시)은 **최상위로 취급한다** — 안 그리면 조용히 사라져
 * "만들었는데 목록에 없다"가 된다. 순환은 방문 표시로 끊는다(groupTree 와 같은 이유: 값이 조금 틀린
 * 것과 화면이 멈추는 것은 대가가 다르다).
 */
export function treeRows(groups: readonly Group[], collapsed: ReadonlySet<string> = new Set()): GroupRow[] {
    const kids = new Map<string | null, Group[]>();
    const known = new Set(groups.map((g) => g.name));
    for (const g of groups) {
        const key = g.parentName !== null && known.has(g.parentName) ? g.parentName : null;
        const arr = kids.get(key);
        if (arr) arr.push(g);
        else kids.set(key, [g]);
    }

    const out: GroupRow[] = [];
    const seen = new Set<string>();
    const walk = (parent: string | null, depth: number): void => {
        for (const g of kids.get(parent) ?? []) {
            if (seen.has(g.name)) continue; // 순환 방어
            seen.add(g.name);
            const children = kids.get(g.name) ?? [];
            out.push({ group: g, depth, hasChildren: children.length > 0 });
            if (children.length > 0 && !collapsed.has(g.name)) walk(g.name, depth + 1);
        }
    };
    walk(null, 0);
    return out;
}

/**
 * 겹침 큰 순서로 편 줄 — 계층을 접고(깊이 0) 값으로 세운다. 같은 수면 이름순.
 * 체인에 든 것이 맨 위(지금 짚은 자리부터 읽게), 그다음이 갈 수 있는 곳, "포함"과 0은 뒤로.
 */
export function overlapRows(
    groups: readonly Group[],
    candidates: ReadonlyMap<string, number>,
    chain: readonly string[],
    groupByName: ReadonlyMap<string, Group>,
): GroupRow[] {
    const rank = (g: Group): number => {
        const rel = relationOf(g.name, chain, groupByName);
        if (rel === "chain") return 0;
        if (rel === "contain") return 2;
        return (candidates.get(g.name) ?? 0) > 0 ? 1 : 3;
    };
    return [...groups]
        .sort((a, b) => {
            const ra = rank(a), rb = rank(b);
            if (ra !== rb) return ra - rb;
            const ca = candidates.get(a.name) ?? 0, cb = candidates.get(b.name) ?? 0;
            if (ca !== cb) return cb - ca;
            return a.name.localeCompare(b.name);
        })
        .map((group) => ({ group, depth: 0, hasChildren: false }));
}

/**
 * 이 그룹을 저 그룹 밑으로 넣을 수 있나. `null` 은 최상위로 빼기.
 *
 * 막는 것 둘:
 *   · 자기 자신 · **자기 자손** 밑으로 — 트리가 끊긴다
 *   · 이미 그 부모 — 할 일이 없다
 * (옛 층위 규칙 — 부모가 자식보다 좁으면 거절 — 은 2026-09-01 타점 층위 폐지로 사라졌다.)
 */
export function canReparent(
    name: string,
    parentName: string | null,
    groupByName: ReadonlyMap<string, Group>,
): boolean {
    const self = groupByName.get(name);
    if (parentName === null) return self?.parentName !== null;
    if (parentName === name) return false;
    if (isAncestorOf(name, parentName, groupByName)) return false;
    if (self?.parentName === parentName) return false;
    return true;
}
