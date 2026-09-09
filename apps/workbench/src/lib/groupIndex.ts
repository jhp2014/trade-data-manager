// 그룹 멤버십 피드 → 조회 인덱스 + 낙관적 토글. 순수 파생(추가 fetch 0).
//  · 축(rankIndex)이 "줄 위 어디냐"를 다룬다면 여긴 "들었냐/안 들었냐"만 — 순서 없는 종류라 위치가 없다.
//  · groupNames 순서 = 서버가 준 순서(그룹 이름순). 낙관적 삽입도 같은 기준으로 끼워 넣어야
//    부착 직후와 서버 응답 후의 칩 순서가 안 흔들린다(부착 순으로 붙이면 refetch 때 자리가 튄다).
//    **이름이 곧 키**라 정렬 기준이 키 자신이다 — 옛 nameOf 조회 함수가 통째로 필요 없어졌다.
//
// **항목은 grain 별 두 피드다** — 차트(종목, 날짜)와 좌표 라벨(종목, 날짜, 분 — 2026-09-09 재도입,
// Point 저장이 아니라 캔들 좌표에 붙은 라벨). 피드·캐시는 분리 유지(무효화가 갈려야 한다)하고,
// 여기 함수들은 rowKey(time 유무 = grain, 두 키 공간은 구분자 수로 갈려 안 섞임)로 양쪽을 다 받는다.
import type { Group } from "@trade-data-manager/wire";
import { expandWithAncestors } from "./groupTree.js";
import { rowKey } from "./pointKey.js";

/** 멤버십 피드 항목의 공통 모양 — GroupMembership(2조각 키)·PointGroupMembership(3조각 키) 둘 다 맞는다. */
type MembershipRef = { stockCode: string; date: string; time?: string };

/** 행 키("code|date" 또는 "code|date|time") → 든 그룹 이름들(이름순). 그룹 0개인 항목은 키가 없음. */
export type GroupIndex = Map<string, string[]>;

export function buildGroupIndex(feed: readonly (MembershipRef & { groupNames: string[] })[]): GroupIndex {
    const idx: GroupIndex = new Map();
    for (const m of feed) idx.set(rowKey(m), m.groupNames);
    return idx;
}

/** 그룹별 사용 건수(삭제 확인 "N건에 들어 있음" · 팔레트 빈도). */
export function countByGroup(feed: readonly { groupNames: string[] }[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const a of feed) for (const name of a.groupNames) m.set(name, (m.get(name) ?? 0) + 1);
    return m;
}

/**
 * 피드의 각 항목 groupNames 를 **조상까지 편** 사본 — 조회(맵 카운트·겹침·롤업)용. 편집은 원본을 본다.
 * 항목 하나가 같은 부모의 자식 둘에 들어 있어도 부모는 항목당 **한 번만** 나온다(expandWithAncestors 가
 * Set 으로 걸러서) — 그래서 이 결과에 countByGroup 을 그대로 얹으면 dedupe 롤업 건수가 된다.
 */
export function expandMemberships<M extends { groupNames: string[] }>(feed: readonly M[], groupByName: ReadonlyMap<string, Group>): M[] {
    return feed.map((m) => {
        const groupNames = expandWithAncestors(m.groupNames, groupByName);
        return groupNames.length === m.groupNames.length ? m : { ...m, groupNames };
    });
}

/**
 * 낙관적 토글 — 멤버십 피드에서 한 그룹을 넣거나 뺀 결과(불변 갱신).
 * 그룹이 0개가 된 항목은 항목째 제거(서버 표현과 동일).
 * item 의 모양(R)이 곧 grain 이다 — day 피드엔 GroupItemRef, point 피드엔 GroupPointItemRef 를 넣는다.
 */
export function applyGroupToggle<R extends MembershipRef>(
    feed: readonly (R & { groupNames: string[] })[],
    item: R,
    groupName: string,
    on: boolean,
): (R & { groupNames: string[] })[] {
    const key = rowKey(item);
    const idx = feed.findIndex((m) => rowKey(m) === key);

    // 바뀔 게 없으면 **같은 배열을 그대로** 돌려준다 — 내용만 같은 새 배열을 만들면 이걸 deps 로 삼은
    // useMemo(인덱스·건수)가 통째로 헛돈다(멤버십 수백 건이면 매 토글마다 재계산).
    if (!on) {
        if (idx < 0 || !feed[idx]!.groupNames.includes(groupName)) return feed as (R & { groupNames: string[] })[];
        const groupNames = feed[idx]!.groupNames.filter((n) => n !== groupName);
        if (groupNames.length === 0) return feed.filter((_, i) => i !== idx); // 빈 항목 안 남김
        return feed.map((m, i) => (i === idx ? { ...m, groupNames } : m));
    }

    if (idx < 0) return [...feed, { ...item, groupNames: [groupName] }];
    if (feed[idx]!.groupNames.includes(groupName)) return feed as (R & { groupNames: string[] })[]; // 이미 있음(멱등)
    const groupNames = [...feed[idx]!.groupNames, groupName].sort((a, b) => a.localeCompare(b));
    return feed.map((m, i) => (i === idx ? { ...m, groupNames } : m));
}
