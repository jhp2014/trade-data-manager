// 그룹의 grain(하루/타점) 분류 — **자손 포함 롤업** 한 벌(decisions.md 「그룹 편집 출구」).
//
// 직접 멤버만 보면 자식만 멤버인 조상이 "빈 그룹"으로 오판돼 반대 grain 목록에 뜬다 — 계층은 한
// grain 을 공유하므로(그룹당 한 grain 관례) 조상 전개로 묶어 판정한다. 빈 그룹은 어느 Set 에도
// 없다(= 양쪽 후보인지 제외인지는 소비자의 질문이 정한다: 배정 팝오버는 양쪽 후보로 올리고,
// 그룹 필터 point 팔레트는 뺀다 — 조건으로선 항상 거짓인 리터럴은 노이즈라서).
//
// 배정 팝오버(섹션)와 그룹 필터 피커(scope 별 목록)가 **같은 Set 을 봐야** 잣대가 갈리지 않는다 —
// 컴포넌트 안에서 다시 굽지 않는다(잣대가 두 곳에서 각자 자라고, 멤버십 전량 롤업이 화면 수만큼 돈다).
// 배급은 useGroups(Provider 한 벌)가 한다.
import type { Group } from "../api/groups.js";
import { expandWithAncestors } from "./groupTree.js";

export interface GroupGrainSets {
    /** 하루 멤버가(자손 포함) 있는 그룹 이름. */
    dayGrain: Set<string>;
    /** 좌표 라벨 멤버가(자손 포함) 있는 그룹 이름. */
    pointGrain: Set<string>;
}

export function groupGrainSets(
    memberships: readonly { groupNames: string[] }[],
    pointMemberships: readonly { groupNames: string[] }[],
    groupByName: Map<string, Group>,
): GroupGrainSets {
    const fold = (feed: readonly { groupNames: string[] }[]): Set<string> => {
        const s = new Set<string>();
        for (const m of feed) for (const n of expandWithAncestors(m.groupNames, groupByName)) s.add(n);
        return s;
    };
    return { dayGrain: fold(memberships), pointGrain: fold(pointMemberships) };
}
