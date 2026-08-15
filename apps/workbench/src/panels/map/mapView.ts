// 유사도 맵 패널의 순수 계산 — 평면 위 그룹의 배치·중첩·겹침. 그리기와 제스처는 React Flow 가 진다.
//
// **점은 항목이 아니라 그룹이다.** 그래서 여기 있는 건 좌표 변환이 아니라 관계 계산이다:
// 어느 그룹이 이 평면에 있나 · 누가 누구 안에 있나 · 두 그룹이 얼마나 겹치나(징검다리).
import type { Group, GroupMembership } from "../../api/groups.js";
import { isAncestorOf } from "../../lib/groupTree.js";

/** 이 평면에 올라와 있는 그룹만(좌표가 있는 것). 안 올린 그룹은 사전에만 있다. */
export function groupsOnMap(groups: readonly Group[], mapId: string): Group[] {
    return groups.filter((g) => g.mapId === mapId && g.x !== null && g.y !== null);
}

/** 아직 어느 평면에도 안 올린 그룹(scope 가 맞는 것만) — 평면에 올릴 후보. */
export function placeableGroups(groups: readonly Group[], scope: string): Group[] {
    return groups.filter((g) => g.mapId === null && g.scope === scope);
}

/** 그룹별 멤버 수 — 노드 크기와 목록에 쓴다. */
export function memberCounts(feed: readonly GroupMembership[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of feed) for (const id of x.groupIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
}

/** 한 그룹의 멤버 항목들 — 노드를 눌렀을 때 "어떤 종목이 들었나". */
export function membersOf(feed: readonly GroupMembership[], groupId: string): GroupMembership[] {
    return feed.filter((m) => m.groupIds.includes(groupId));
}

/**
 * 두 그룹의 멤버 겹침 = **징검다리**. 저장하지 않고 멤버십에서 센다.
 * 한 항목의 그룹이 k 개면 쌍은 k(k-1)/2 — 손으로 붙이는 수라 k 는 작고 전체는 항목 수에 선형이다.
 * `only` 를 주면 그 그룹이 낀 쌍만 — 전부 그리면 그룹이 늘수록 실뭉치가 된다(선택 기반이 기본).
 * `groupById` 를 주면 **조상–자손 쌍은 뺀다** — 상속을 편 피드에서 자식 소속은 부모와 반드시 겹치는데,
 * 그건 포함관계(이미 컨테이너로 보인다)지 징검다리가 아니다.
 */
export function overlaps(
    feed: readonly GroupMembership[],
    opts: { within?: ReadonlySet<string>; only?: string | null; groupById?: ReadonlyMap<string, Group> } = {},
): { aId: string; bId: string; count: number }[] {
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

/**
 * 중첩 깊이 — 부모를 타고 올라간 횟수. 들여쓰기·크기에 쓴다.
 * 순환은 저장 경로가 막지만, 옛 데이터가 있어도 그리기가 멈추지 않게 상한을 둔다.
 */
export function depthOf(groups: readonly Group[], id: string): number {
    const byId = new Map(groups.map((g) => [g.id, g]));
    let d = 0;
    let cur = byId.get(id);
    while (cur?.parentId != null && d <= groups.length) {
        cur = byId.get(cur.parentId);
        d++;
    }
    return d;
}

/** 이 그룹의 자식들(직계만). */
export const childrenOf = (groups: readonly Group[], id: string): Group[] => groups.filter((g) => g.parentId === id);
