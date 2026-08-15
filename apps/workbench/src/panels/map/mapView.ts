// 맵 패널의 순수 계산 — 평면 위 그룹의 소속·겹침을 **모집단 기준**으로 센다.
//
// 맵은 깔때기의 여느 구독자와 같다: 재료는 "지금 보는 집합"(짚은 칸 반영, 없으면 최종 생존)이고,
// 판정은 깔때기와 같은 적용 집합(appliedGroupIdsOf — 직접 ∪ 하루상속 ∪ 계층조상)이다. 맵만 다른
// 잣대로 세면 골격·시트와 숫자가 어긋나고, 그 어긋남은 화면 어디에도 신호가 없다.
//
// 겹침(징검다리)은 저장하지 않고 매번 센다. 조상–자손 쌍은 뺀다 — 포함관계는 컨테이너 영역으로
// 이미 보이는 것이지 징검다리가 아니다(overlaps 의 groupById 옵션).
import type { Group, GroupMembership } from "../../api/groups.js";
import { isAncestorOf } from "../../lib/groupTree.js";
import { sidesBetween, type Side } from "./mapLayout.js";

/** 모집단 항목 — 깔때기 FunnelItem 과 같은 모양(시각 없으면 하루). */
export interface PopulationItem {
    stockCode: string;
    date: string;
    time?: string;
}

/** 이 평면에 올라와 있는 그룹만(좌표가 있는 것). 안 올린 그룹은 사전에만 있다. */
export function groupsOnMap(groups: readonly Group[], mapId: string): Group[] {
    return groups.filter((g) => g.mapId === mapId && g.x !== null && g.y !== null);
}

/** 아직 어느 평면에도 안 올린 그룹(scope 가 맞는 것만) — 평면에 올릴 후보. */
export function placeableGroups(groups: readonly Group[], scope: string): Group[] {
    return groups.filter((g) => g.mapId === null && g.scope === scope);
}

/** 이 그룹의 자식들(직계만). */
export const childrenOf = (groups: readonly Group[], id: string): Group[] => groups.filter((g) => g.parentId === id);

/**
 * 모집단 → 의사 멤버십 피드. groupIds = 항목의 **적용** 집합(주입 — 깔때기와 같은 판정).
 * 카운트·겹침·멤버 목록이 전부 이 피드 하나에서 나온다(항목당 판정 1회).
 */
export function populationFeed(
    items: readonly PopulationItem[],
    appliedIdsOf: (item: PopulationItem) => readonly string[],
): GroupMembership[] {
    return items.map((i) => ({ stockCode: i.stockCode, date: i.date, ...(i.time !== undefined ? { time: i.time } : {}), groupIds: [...appliedIdsOf(i)] }));
}

/** 그룹별 모집단 소속 수 — 노드에 쓰는 숫자. 적용 집합 기준이라 자식 소속도 부모에 센다(항목당 1회). */
export function populationCounts(feed: readonly GroupMembership[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of feed) for (const id of x.groupIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
}

/** 이 그룹들을 **전부** 가진 항목 — 체인의 분모이자 목록 패널이 보여주는 집합. 빈 체인은 전부. */
export function membersOfAll(feed: readonly GroupMembership[], groupIds: readonly string[]): GroupMembership[] {
    if (groupIds.length === 0) return [...feed];
    return feed.filter((m) => groupIds.every((id) => m.groupIds.includes(id)));
}

/**
 * 체인에서 한 걸음 더 갈 수 있는 곳 — 후보 그룹 → **체인 전부 ∧ 그 후보** 수(드릴다운 값).
 * 체인 자신과, 체인 멤버의 조상·자손은 뺀다: 자식 소속은 부모와 반드시 겹치는데 그건 포함관계지
 * 징검다리가 아니고, 그 관계는 이미 컨테이너 영역으로 보인다.
 * 0인 후보는 아예 담지 않는다 — "갈 수 있는 곳"만 남긴다.
 */
export function chainCandidates(
    feed: readonly GroupMembership[],
    chain: readonly string[],
    opts: { within?: ReadonlySet<string>; groupById?: ReadonlyMap<string, Group> } = {},
): Map<string, number> {
    const out = new Map<string, number>();
    if (chain.length === 0) return out;
    const inChain = new Set(chain);
    const blocked = (id: string): boolean =>
        opts.groupById !== undefined && chain.some((c) => isAncestorOf(id, c, opts.groupById!) || isAncestorOf(c, id, opts.groupById!));
    for (const m of membersOfAll(feed, chain)) {
        for (const id of new Set(m.groupIds)) {
            if (inChain.has(id)) continue;
            if (opts.within !== undefined && !opts.within.has(id)) continue;
            if (blocked(id)) continue;
            out.set(id, (out.get(id) ?? 0) + 1);
        }
    }
    return out;
}

/**
 * 두 그룹의 멤버 겹침 = **징검다리**. 저장하지 않고 피드에서 센다.
 * 한 항목의 그룹이 k 개면 쌍은 k(k-1)/2 — 손으로 붙이는 수라 k 는 작고 전체는 항목 수에 선형이다.
 * `only` 를 주면 그 그룹이 낀 쌍만 — 전부 그리면 그룹이 늘수록 실뭉치가 된다(선택 기반이 기본).
 * `groupById` 를 주면 **조상–자손 쌍은 뺀다** — 상속을 편 피드에서 자식 소속은 부모와 반드시 겹치는데,
 * 그건 포함관계(이미 컨테이너로 보인다)지 징검다리가 아니다.
 */
/**
 * 교집합 칩의 id — 체인 i 번째(1부터)를 고르며 생긴 칩. 그 그룹 노드 **안에** 자식으로 들어간다.
 * 체인 0번 자리에는 칩이 없다(고른 게 하나면 교집합이랄 게 없고, 그 그룹 자신이 곧 그 집합이다).
 */
export const chipId = (index: number): string => `chip-${index}`;

/** 체인 i 번째 자리에서 선이 붙는 노드 — 0이면 그룹 자신, 그 뒤는 그 자리의 칩. */
export const chainAnchor = (chain: readonly string[], index: number): string =>
    (index === 0 ? chain[0]! : chipId(index));

/**
 * 화살표 하나. 두 종류가 **역할로 갈린다**:
 *   · `candidate`(실선) = 체인 끝에서 갈 수 있는 곳. `count` 는 거기까지 갔을 때 남는 수.
 *   · `chain`(점선)     = 지나온 길(클릭 순서). 수는 없다 — 이미 지나온 자리라 물을 게 없다.
 * `weight`(0~1)는 후보들 사이의 상대 크기(숫자 크기에 실린다).
 */
export interface MapArrow {
    id: string;
    from: string;
    to: string;
    fromSide: Side;
    toSide: Side;
    kind: "candidate" | "chain";
    count?: number;
    weight: number;
}

/**
 * 체인 + 후보 → 화살표 모델.
 *
 * **방향은 데이터가 아니라 시선**이다: 겹침은 대칭(A∩B = B∩A)이라 화살표는 "여기서 저기로 퍼진다"는
 * 탐색 방향이고, 체인을 다시 쌓으면 통째로 바뀐다. 이 규칙이 깨지면 없는 비대칭을 지어내는 그림이 된다.
 * 실선은 언제나 **체인의 마지막**에서 나간다 — 그게 지금 서 있는 자리다.
 * 상자를 못 찾는 짝(평면에서 막 내려간 그룹)은 조용히 버린다.
 */
export function mapArrows(
    chain: readonly string[],
    candidates: ReadonlyMap<string, number>,
    boxOf: (id: string) => { x: number; y: number; w: number; h: number } | undefined,
): { arrows: MapArrow[]; anchors: Map<string, Side[]> } {
    const anchors = new Map<string, Side[]>();
    const arrows: MapArrow[] = [];
    if (chain.length === 0) return { arrows, anchors };
    const mark = (id: string, s: Side): void => {
        const cur = anchors.get(id);
        if (cur) { if (!cur.includes(s)) cur.push(s); } else anchors.set(id, [s]);
    };
    const link = (from: string, to: string, kind: "candidate" | "chain", count?: number, weight = 0): void => {
        const a = boxOf(from);
        const b = boxOf(to);
        if (!a || !b) return;
        const { source, target } = sidesBetween(a, b);
        mark(from, source);
        mark(to, target);
        arrows.push({ id: `${kind === "chain" ? "c" : "o"}:${from}-${to}`, from, to, fromSide: source, toSide: target, kind, ...(count !== undefined ? { count } : {}), weight });
    };

    // 지나온 길 — 첫 그룹에서 시작해 칩을 차례로 잇는다(칩이 곧 그 지점의 교집합이다).
    for (let i = 1; i < chain.length; i++) link(chainAnchor(chain, i - 1), chainAnchor(chain, i), "chain");

    // 갈 수 있는 곳 — **지금 서 있는 자리**(마지막 칩, 없으면 첫 그룹)에서 각 후보로.
    const head = chainAnchor(chain, chain.length - 1);
    let max = 0;
    for (const c of candidates.values()) max = Math.max(max, c);
    for (const [id, count] of candidates) link(head, id, "candidate", count, max > 0 ? count / max : 0);
    return { arrows, anchors };
}
