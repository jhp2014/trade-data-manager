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

/** 짚은 그룹의 모집단 멤버 — 목록 패널. */
export function populationMembersOf(feed: readonly GroupMembership[], groupId: string): GroupMembership[] {
    return feed.filter((m) => m.groupIds.includes(groupId));
}

/**
 * 두 그룹의 멤버 겹침 = **징검다리**. 저장하지 않고 피드에서 센다.
 * 한 항목의 그룹이 k 개면 쌍은 k(k-1)/2 — 손으로 붙이는 수라 k 는 작고 전체는 항목 수에 선형이다.
 * `only` 를 주면 그 그룹이 낀 쌍만 — 전부 그리면 그룹이 늘수록 실뭉치가 된다(선택 기반이 기본).
 * `groupById` 를 주면 **조상–자손 쌍은 뺀다** — 상속을 편 피드에서 자식 소속은 부모와 반드시 겹치는데,
 * 그건 포함관계(이미 컨테이너로 보인다)지 징검다리가 아니다.
 */
export interface Overlap { aId: string; bId: string; count: number }

/** 화살표 하나 — 짚은 그룹에서 이웃으로. `weight`(0~1)는 이 선택 안에서의 상대 크기(숫자 크기에 실린다). */
export interface BridgeArrow {
    id: string;
    from: string;
    to: string;
    fromSide: Side;
    toSide: Side;
    count: number;
    weight: number;
}

/**
 * 겹침 → 화살표 모델. **방향은 데이터가 아니라 시선**이다: 겹침은 대칭(A∩B = B∩A)이라 화살표는
 * "짚은 그룹에서 저기로 퍼진다"는 뜻이고, 다른 그룹을 짚으면 통째로 뒤집힌다. 이 규칙이 깨지면
 * 없는 비대칭을 지어내는 그림이 된다 — 그래서 출발은 언제나 `picked` 다.
 * 상자를 못 찾는 쌍(평면에서 막 내려간 그룹)은 조용히 버린다.
 */
export function bridgeArrows(
    overlaps: readonly Overlap[],
    picked: string | null,
    boxOf: (id: string) => { x: number; y: number; w: number; h: number } | undefined,
): { arrows: BridgeArrow[]; anchors: Map<string, Side[]> } {
    const anchors = new Map<string, Side[]>();
    const arrows: BridgeArrow[] = [];
    if (picked === null) return { arrows, anchors };
    const max = overlaps.reduce((m, o) => Math.max(m, o.count), 0);
    const mark = (id: string, s: Side): void => {
        const cur = anchors.get(id);
        if (cur) { if (!cur.includes(s)) cur.push(s); } else anchors.set(id, [s]);
    };
    for (const o of overlaps) {
        // 짚은 그룹이 안 낀 쌍은 버린다 — 그 쌍엔 "출발이 picked" 라는 규칙을 세울 자리가 없어서
        // 그냥 두면 엉뚱한 방향(이웃→이웃)의 화살표가 나온다. 호출부가 only 로 걸러 오는 게 정상이지만,
        // 규칙을 아는 건 이 함수라 여기서 지킨다.
        if (o.aId !== picked && o.bId !== picked) continue;
        // overlaps 는 id 정렬 순이라 짚은 쪽이 a 일 수도 b 일 수도 있다 — 출발을 picked 로 세운다.
        const from = o.aId === picked ? o.aId : o.bId;
        const to = o.aId === picked ? o.bId : o.aId;
        const fromBox = boxOf(from);
        const toBox = boxOf(to);
        if (!fromBox || !toBox) continue;
        const { source, target } = sidesBetween(fromBox, toBox);
        mark(from, source);
        mark(to, target);
        arrows.push({ id: `o:${from}-${to}`, from, to, fromSide: source, toSide: target, count: o.count, weight: max > 0 ? o.count / max : 0 });
    }
    return { arrows, anchors };
}

export function overlaps(
    feed: readonly GroupMembership[],
    opts: { within?: ReadonlySet<string>; only?: string | null; groupById?: ReadonlyMap<string, Group> } = {},
): Overlap[] {
    const byPair = new Map<string, number>();
    for (const m of feed) {
        const ids = [...new Set(m.groupIds)].filter((id) => opts.within === undefined || opts.within.has(id)).sort();
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                if (opts.only != null && ids[i] !== opts.only && ids[j] !== opts.only) continue;
                if (opts.groupById && (isAncestorOf(ids[i]!, ids[j]!, opts.groupById) || isAncestorOf(ids[j]!, ids[i]!, opts.groupById))) continue;
                const k = `${ids[i]}|${ids[j]}`;
                byPair.set(k, (byPair.get(k) ?? 0) + 1);
            }
        }
    }
    return [...byPair].map(([k, count]) => {
        const [aId, bId] = k.split("|");
        return { aId: aId!, bId: bId!, count };
    });
}
