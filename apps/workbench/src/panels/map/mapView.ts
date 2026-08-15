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
import { type Point } from "./midpoints.js";

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
/** 교집합 노드 id — 선택이 같으면 같은 id(순서는 무관하므로 정렬해 만든다). */
export const MID_ID = "mid";

/**
 * 선택한 그룹들의 **교집합 그 자체를 물체로** 세운 것.
 *
 * ⚠ 이건 **손댈 수 없는 표시물**이다: 누르지도 끌지도 못하고, 오직 선택에서 유도된다.
 * 교집합을 눌러 파고들게 만들려다 라이브러리의 선택·드래그 배선과 계속 싸웠다 — 선택은 RF 가 이미
 * 잘하는 일(클릭=선택, Ctrl+클릭=추가)이니 그걸 쓰고, 이 노드는 그 결과를 보여주기만 한다.
 */
export interface MidNode {
    id: string;
    center: Point;
    count: number;
    /** 이 교집합의 정체 — 선택된 그룹 이름들이 들어갈 자리(id 목록). */
    members: string[];
}

/** 노드끼리 잇는 선. 화살촉이 없다(교집합은 대칭이라 방향이 없다). */
export interface ChainLink {
    id: string;
    from: string;
    to: string;
    fromSide: Side;
    toSide: Side;
    /** 선택된 그룹 → 교집합(참)인가, 교집합 → 후보(거짓)인가. 진하기가 갈린다. */
    traversed: boolean;
    /** 후보 선에만 있는 수 — "저기까지 더하면 몇 개 남나". */
    count?: number;
}

/**
 * 선택 + 후보 → 그릴 것 전부(교집합 노드 하나와 선들).
 *
 * 선택이 둘 이상이면 그 **가운데에 교집합 노드**가 서고, 선택된 그룹들이 거기로 이어진다(점선).
 * 후보로 나가는 선은 그 교집합에서 출발한다 — 선택이 하나면 그 그룹 자신이 출발점이다.
 * 순서를 안 쓴다: 교집합은 대칭이라 A,B 를 어느 쪽부터 골랐는지가 그림을 바꾸면 안 된다.
 * 상자를 못 찾는 그룹(평면에서 막 내려간 것)은 조용히 버린다.
 */
export function selectionGraph(
    selected: readonly string[],
    candidates: ReadonlyMap<string, number>,
    boxOf: (id: string) => { x: number; y: number; w: number; h: number } | undefined,
    intersectionCount: number,
): { mid: MidNode | null; links: ChainLink[] } {
    const links: ChainLink[] = [];
    if (selected.length === 0) return { mid: null, links };
    const centerOf = (id: string): Point | undefined => {
        const b = boxOf(id);
        return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined;
    };
    /** 교집합 노드는 상자가 없다 — 선 방향을 재려면 점을 상자로 감싸 준다. */
    const asBox = (p: Point) => ({ x: p.x, y: p.y, w: 0, h: 0 });
    const sides = (a: Point, b: Point): { source: Side; target: Side } => sidesBetween(asBox(a), asBox(b));

    const placed = selected.map((id) => ({ id, c: centerOf(id) })).filter((x): x is { id: string; c: Point } => x.c !== undefined);
    if (placed.length === 0) return { mid: null, links };

    // 선택이 하나면 교집합 노드가 없다(제 자신이 곧 그 집합이다).
    let mid: MidNode | null = null;
    let from: { id: string; c: Point } = placed[0]!;
    if (placed.length > 1) {
        const center = {
            x: placed.reduce((s, p) => s + p.c.x, 0) / placed.length,
            y: placed.reduce((s, p) => s + p.c.y, 0) / placed.length,
        };
        mid = { id: MID_ID, center, count: intersectionCount, members: placed.map((p) => p.id) };
        for (const p of placed) {
            const s = sides(p.c, center);
            links.push({ id: `l:${p.id}>${MID_ID}`, from: p.id, to: MID_ID, fromSide: s.source, toSide: s.target, traversed: true });
        }
        from = { id: MID_ID, c: center };
    }

    for (const [target, count] of candidates) {
        const tp = centerOf(target);
        if (!tp) continue;
        const s = sides(from.c, tp);
        links.push({ id: `l:${from.id}>${target}`, from: from.id, to: target, fromSide: s.source, toSide: s.target, traversed: false, count });
    }
    return { mid, links };
}
