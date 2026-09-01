// 그룹 멤버십 피드 → 조회 인덱스 + 낙관적 토글. 순수 파생(추가 fetch 0).
//  · 축(rankIndex)이 "줄 위 어디냐"를 다룬다면 여긴 "들었냐/안 들었냐"만 — 순서 없는 종류라 위치가 없다.
//  · groupNames 순서 = 서버가 준 순서(그룹 이름순). 낙관적 삽입도 같은 기준으로 끼워 넣어야
//    부착 직후와 서버 응답 후의 칩 순서가 안 흔들린다(부착 순으로 붙이면 refetch 때 자리가 튄다).
//    **이름이 곧 키**라 정렬 기준이 키 자신이다 — 옛 nameOf 조회 함수가 통째로 필요 없어졌다.
//
// **항목은 언제나 차트(종목, 날짜)다** — 2026-09-01 타점 층위 폐지로 피드가 한 층위만 남았다
// (옛 isDayMembership·타점 인덱스는 그때 사라졌다).
import type { Group, GroupMembership, GroupItemRef } from "@trade-data-manager/wire";
import { expandWithAncestors } from "./groupTree.js";
import { chartKey } from "./pointKey.js";

/** 차트키("code|date") → 든 그룹 이름들(이름순). 그룹 0개인 차트는 키가 없음. */
export type GroupIndex = Map<string, string[]>;

export function buildGroupIndex(feed: readonly GroupMembership[]): GroupIndex {
    const idx: GroupIndex = new Map();
    for (const m of feed) idx.set(chartKey(m), m.groupNames);
    return idx;
}

/** 그룹별 사용 건수(삭제 확인 "N건에 들어 있음" · 팔레트 빈도). */
export function countByGroup(feed: readonly GroupMembership[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const a of feed) for (const name of a.groupNames) m.set(name, (m.get(name) ?? 0) + 1);
    return m;
}

/**
 * 피드의 각 항목 groupNames 를 **조상까지 편** 사본 — 조회(맵 카운트·겹침·롤업)용. 편집은 원본을 본다.
 * 항목 하나가 같은 부모의 자식 둘에 들어 있어도 부모는 항목당 **한 번만** 나온다(expandWithAncestors 가
 * Set 으로 걸러서) — 그래서 이 결과에 countByGroup 을 그대로 얹으면 dedupe 롤업 건수가 된다.
 */
export function expandMemberships(feed: readonly GroupMembership[], groupByName: ReadonlyMap<string, Group>): GroupMembership[] {
    return feed.map((m) => {
        const groupNames = expandWithAncestors(m.groupNames, groupByName);
        return groupNames.length === m.groupNames.length ? m : { ...m, groupNames };
    });
}

/**
 * 낙관적 토글 — 멤버십 피드에서 한 그룹을 넣거나 뺀 결과(불변 갱신).
 * 그룹이 0개가 된 항목은 항목째 제거(서버 표현과 동일).
 */
export function applyGroupToggle(
    feed: readonly GroupMembership[],
    item: GroupItemRef,
    groupName: string,
    on: boolean,
): GroupMembership[] {
    const key = chartKey(item);
    const idx = feed.findIndex((m) => chartKey(m) === key);

    // 바뀔 게 없으면 **같은 배열을 그대로** 돌려준다 — 내용만 같은 새 배열을 만들면 이걸 deps 로 삼은
    // useMemo(인덱스·건수)가 통째로 헛돈다(멤버십 수백 건이면 매 토글마다 재계산).
    if (!on) {
        if (idx < 0 || !feed[idx]!.groupNames.includes(groupName)) return feed as GroupMembership[];
        const groupNames = feed[idx]!.groupNames.filter((n) => n !== groupName);
        if (groupNames.length === 0) return feed.filter((_, i) => i !== idx); // 빈 항목 안 남김
        return feed.map((m, i) => (i === idx ? { ...m, groupNames } : m));
    }

    if (idx < 0) return [...feed, { ...item, groupNames: [groupName] }];
    if (feed[idx]!.groupNames.includes(groupName)) return feed as GroupMembership[]; // 이미 있음(멱등)
    const groupNames = [...feed[idx]!.groupNames, groupName].sort((a, b) => a.localeCompare(b));
    return feed.map((m, i) => (i === idx ? { ...m, groupNames } : m));
}
