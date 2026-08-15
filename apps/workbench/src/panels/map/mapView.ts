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
import { spreadMidpoints, type MidpointSpec, type Point } from "./midpoints.js";

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
 * 두 자리 사이에 **교집합 그 자체를 물체로** 세운 것. 화살표를 안 쓰는 이유가 이것이다 —
 * 겹침은 대칭(A∩B = B∩A)이라 방향을 그리려면 "탐색 방향"이라는 변명이 필요했는데,
 * 교집합을 노드로 만들면 그냥 선 두 개로 이어진 하나의 사실이 된다.
 */
export interface MidNode {
    /** `m:A+B` — 체인 접두사로 만든 안정 id(자리가 바뀌어도 같은 교집합이면 같은 id). */
    id: string;
    center: Point;
    count: number;
    /** 이 교집합의 정체 — 선택되면 이 이름들을 텍스트로 보여준다. */
    prefix: string[];
    /** 이미 지나온 것(체인에 든 것)인가. 아니면 갈 수 있는 후보. */
    traversed: boolean;
}

/** 노드—교집합 노드를 잇는 선. 화살촉이 없다(대칭이라 방향이 없다). */
export interface ChainLink {
    id: string;
    from: string;
    to: string;
    fromSide: Side;
    toSide: Side;
    /** 지나온 길인가 — 그리기가 진하기를 가른다. */
    traversed: boolean;
}

const midId = (prefix: readonly string[]): string => `m:${prefix.join("+")}`;

/**
 * 체인 + 후보 → 그릴 것 전부(교집합 노드와 선).
 *
 * 기하는 재귀적이다: `[A]` 면 A 에서 각 후보로 뻗고, `[A,B]` 면 **A∧B 교집합 노드**가 새 출발점이 되어
 * 거기서 다시 뻗는다. 그래서 지나온 길이 공간에 남고 별도의 "경로 표시"가 필요 없다.
 * 자리는 두 끝의 중점이되, 한 골목에 몰리면 제 선 위에서 비켜선다(spreadMidpoints).
 * 상자를 못 찾는 짝(평면에서 막 내려간 그룹)은 조용히 버린다.
 */
export function chainGraph(
    chain: readonly string[],
    candidates: ReadonlyMap<string, number>,
    boxOf: (id: string) => { x: number; y: number; w: number; h: number } | undefined,
    countOfPrefix: (prefix: readonly string[]) => number,
): { mids: MidNode[]; links: ChainLink[] } {
    const mids: MidNode[] = [];
    const links: ChainLink[] = [];
    if (chain.length === 0) return { mids, links };
    const centerOf = (id: string): Point | undefined => {
        const b = boxOf(id);
        return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined;
    };
    /** 교집합 노드는 상자가 없다 — 선 방향을 재려면 점을 상자로 감싸 준다. */
    const asBox = (p: Point) => ({ x: p.x, y: p.y, w: 0, h: 0 });
    const sides = (a: Point, b: Point): { source: Side; target: Side } => sidesBetween(asBox(a), asBox(b));

    let baseId = chain[0]!;
    const start = centerOf(baseId);
    if (!start) return { mids, links };
    let basePos: Point = start;

    // 지나온 걸음들 — 각 단계마다 교집합 노드가 하나 서고, 그게 다음 걸음의 출발점이 된다.
    for (let i = 1; i < chain.length; i++) {
        const target = chain[i]!;
        const tp = centerOf(target);
        if (!tp) break;
        const prefix = chain.slice(0, i + 1);
        const id = midId(prefix);
        const center = { x: (basePos.x + tp.x) / 2, y: (basePos.y + tp.y) / 2 };
        mids.push({ id, center, count: countOfPrefix(prefix), prefix, traversed: true });
        const s1 = sides(basePos, center);
        const s2 = sides(center, tp);
        links.push({ id: `l:${baseId}>${id}`, from: baseId, to: id, fromSide: s1.source, toSide: s1.target, traversed: true });
        links.push({ id: `l:${id}>${target}`, from: id, to: target, fromSide: s2.source, toSide: s2.target, traversed: true });
        baseId = id;
        basePos = center;
    }

    // 갈 수 있는 곳 — 지금 출발점에서 각 후보로. 중점끼리 몰리면 비켜선다.
    const specs: MidpointSpec[] = [];
    for (const [target] of candidates) {
        const tp = centerOf(target);
        if (!tp) continue;
        specs.push({ id: midId([...chain, target]), from: basePos, to: tp });
    }
    const placed = spreadMidpoints(specs);
    for (const [target, count] of candidates) {
        const tp = centerOf(target);
        if (!tp) continue;
        const prefix = [...chain, target];
        const id = midId(prefix);
        const center = placed.get(id) ?? { x: (basePos.x + tp.x) / 2, y: (basePos.y + tp.y) / 2 };
        mids.push({ id, center, count, prefix, traversed: false });
        const s1 = sides(basePos, center);
        const s2 = sides(center, tp);
        links.push({ id: `l:${baseId}>${id}`, from: baseId, to: id, fromSide: s1.source, toSide: s1.target, traversed: false });
        links.push({ id: `l:${id}>${target}`, from: id, to: target, fromSide: s2.source, toSide: s2.target, traversed: false });
    }
    return { mids, links };
}
