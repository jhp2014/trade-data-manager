// 그룹 목록의 순수 계산 — 그룹의 소속·겹침을 **모집단 기준**으로 센다. (옛 맵 패널에서 이사)
//
// 그룹 목록은 깔때기의 여느 구독자와 같다: 재료는 "지금 보는 집합"(짚은 칸 반영, 없으면 최종 생존)이고,
// 판정은 깔때기와 같은 적용 집합(appliedGroupIdsOf — 직접 ∪ 하루상속 ∪ 계층조상)이다. 여기만 다른
// 잣대로 세면 골격·시트와 숫자가 어긋나고, 그 어긋남은 화면 어디에도 신호가 없다.
//
// 겹침(징검다리)은 저장하지 않고 매번 센다. 조상–자손 쌍은 뺀다 — 포함관계는 계층(트리 들여쓰기)으로
// 이미 보이는 것이지 징검다리가 아니다(chainCandidates 의 groupByName 옵션).
import type { Group, GroupMembership } from "../../api/groups.js";
import { isAncestorOf } from "../../lib/groupTree.js";

/** 모집단 항목 — 깔때기 FunnelItem 과 같은 모양(시각 없으면 하루). */
export interface PopulationItem {
    stockCode: string;
    date: string;
    time?: string;
}

/**
 * 모집단 → 의사 멤버십 피드. groupNames = 항목의 **적용** 집합(주입 — 깔때기와 같은 판정).
 * 카운트·겹침·멤버 목록이 전부 이 피드 하나에서 나온다(항목당 판정 1회).
 */
export function populationFeed(
    items: readonly PopulationItem[],
    appliedNamesOf: (item: PopulationItem) => readonly string[],
): GroupMembership[] {
    return items.map((i) => ({ stockCode: i.stockCode, date: i.date, ...(i.time !== undefined ? { time: i.time } : {}), groupNames: [...appliedNamesOf(i)] }));
}

/** 그룹별 모집단 소속 수 — 행에 쓰는 숫자. 적용 집합 기준이라 자식 소속도 부모에 센다(항목당 1회). */
export function populationCounts(feed: readonly GroupMembership[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of feed) for (const id of x.groupNames) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
}

/** 이 그룹들을 **전부** 가진 항목 — 체인의 분모이자 목록이 보여주는 집합. 빈 체인은 전부. */
export function membersOfAll(feed: readonly GroupMembership[], groupNames: readonly string[]): GroupMembership[] {
    if (groupNames.length === 0) return [...feed];
    return feed.filter((m) => groupNames.every((id) => m.groupNames.includes(id)));
}

/**
 * 체인에서 한 걸음 더 갈 수 있는 곳 — 후보 그룹 → **체인 전부 ∧ 그 후보** 수(드릴다운 값).
 * 체인 자신과, 체인 멤버의 조상·자손은 뺀다: 자식 소속은 부모와 반드시 겹치는데 그건 포함관계지
 * 징검다리가 아니고, 그 관계는 이미 트리 들여쓰기로 보인다.
 * 0인 후보는 아예 담지 않는다 — "갈 수 있는 곳"만 남긴다.
 */
export function chainCandidates(
    feed: readonly GroupMembership[],
    chain: readonly string[],
    opts: { groupByName?: ReadonlyMap<string, Group> } = {},
): Map<string, number> {
    const out = new Map<string, number>();
    if (chain.length === 0) return out;
    const inChain = new Set(chain);
    const blocked = (id: string): boolean =>
        opts.groupByName !== undefined && chain.some((c) => isAncestorOf(id, c, opts.groupByName!) || isAncestorOf(c, id, opts.groupByName!));
    for (const m of membersOfAll(feed, chain)) {
        for (const id of new Set(m.groupNames)) {
            if (inChain.has(id)) continue;
            if (blocked(id)) continue;
            out.set(id, (out.get(id) ?? 0) + 1);
        }
    }
    return out;
}
