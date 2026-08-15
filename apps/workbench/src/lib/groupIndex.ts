// 그룹 멤버십 피드 → 조회 인덱스 + 낙관적 토글. 순수 파생(추가 fetch 0).
//  · 축(rankIndex)이 "줄 위 어디냐"를 다룬다면 여긴 "들었냐/안 들었냐"만 — 순서 없는 종류라 위치가 없다.
//  · groupIds 순서 = 서버가 준 순서(그룹 이름순). 낙관적 삽입도 같은 기준으로 끼워 넣어야
//    부착 직후와 서버 응답 후의 칩 순서가 안 흔들린다(부착 순으로 붙이면 refetch 때 자리가 튄다).
//
// **피드가 하나다**(옛날엔 타점 부착·차트 부착 둘). 멤버십은 시각 유무로 층위가 갈리므로 한 배열에서
// 접어 두 인덱스를 만든다 — 정션을 합친 스키마와 같은 판단이다.
import type { GroupMembership, GroupItemRef } from "@trade-data-manager/wire";
import { pointKey, chartKey, type PointKey, type PointRef } from "./pointKey.js";

/** pk("code|date|time") → 든 그룹 id들(이름순). 그룹 0개인 타점은 키가 없음. */
export type GroupIndex = Map<PointKey, string[]>;

/** 멤버십 하나가 하루 소속인가(시각이 없다). */
export const isDayMembership = (m: GroupItemRef): boolean => m.time === undefined;

/** 타점 소속만 골라 접는다. */
export function buildGroupIndex(feed: readonly GroupMembership[]): GroupIndex {
    const idx: GroupIndex = new Map();
    for (const m of feed) if (!isDayMembership(m)) idx.set(pointKey(m as PointRef), m.groupIds);
    return idx;
}

/** 차트키("code|date") → 하루 소속 그룹 id들. 같은 피드에서 시각 없는 것만 접는다. */
export function buildChartGroupIndex(feed: readonly GroupMembership[]): Map<string, string[]> {
    const idx = new Map<string, string[]>();
    for (const m of feed) if (isDayMembership(m)) idx.set(chartKey(m), m.groupIds);
    return idx;
}

/** 그룹별 사용 건수(삭제 확인 "N건에 들어 있음" · 팔레트 빈도). 두 층위를 **합산**한다. */
export function countByGroup(feed: readonly GroupMembership[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const a of feed) for (const id of a.groupIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
}

/** 항목 키 — 하루 소속은 시각이 없다. 피드를 접고 토글 대상을 찾는 기준. */
const itemKey = (m: GroupItemRef): string => (isDayMembership(m) ? chartKey(m) : pointKey(m as PointRef));

/**
 * 낙관적 토글 — 멤버십 피드에서 한 그룹을 넣거나 뺀 결과(불변 갱신).
 * **하루·타점 둘 다 이 함수 하나**가 다룬다(시각 유무로 갈릴 뿐 규칙이 같다).
 * nameOf 는 정렬 기준(서버와 같은 이름순 유지). 그룹이 0개가 된 항목은 항목째 제거(서버 표현과 동일).
 */
export function applyGroupToggle(
    feed: readonly GroupMembership[],
    item: GroupItemRef,
    groupId: string,
    on: boolean,
    nameOf: (groupId: string) => string,
): GroupMembership[] {
    const key = itemKey(item);
    const idx = feed.findIndex((m) => itemKey(m) === key);

    // 바뀔 게 없으면 **같은 배열을 그대로** 돌려준다 — 내용만 같은 새 배열을 만들면 이걸 deps 로 삼은
    // useMemo(인덱스·건수)가 통째로 헛돈다(멤버십 수백 건이면 매 토글마다 재계산).
    if (!on) {
        if (idx < 0 || !feed[idx]!.groupIds.includes(groupId)) return feed as GroupMembership[];
        const groupIds = feed[idx]!.groupIds.filter((id) => id !== groupId);
        if (groupIds.length === 0) return feed.filter((_, i) => i !== idx); // 빈 항목 안 남김
        return feed.map((m, i) => (i === idx ? { ...m, groupIds } : m));
    }

    if (idx < 0) return [...feed, { ...item, groupIds: [groupId] }];
    if (feed[idx]!.groupIds.includes(groupId)) return feed as GroupMembership[]; // 이미 있음(멱등)
    const groupIds = [...feed[idx]!.groupIds, groupId].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return feed.map((m, i) => (i === idx ? { ...m, groupIds } : m));
}
