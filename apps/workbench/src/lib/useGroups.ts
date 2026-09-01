// 그룹 한 벌 — 차트 카드·타점 정보 패널·그룹 메뉴·시트/필터·골격 패널·맵이 공유한다.
// 사전(groups)과 멤버십을 늘 같이 쓰므로 훅 하나로 준다(팔레트 = 사전 + 빈도).
//
// **멤버십 피드는 하나**다(옛날엔 타점 부착·차트 부착 둘). 시각 유무로 층위가 갈릴 뿐 같은 사실이라
// 정션도 캐시도 합쳤다. **상속은 두 축**이고 규칙은 같다 — 조회는 상속 포함, 편집은 직접만:
//   · 층위 상속: 하루 그룹은 그 차트의 모든 타점에 적용된다.
//   · 계층 상속: 자식 그룹 소속이면 조상 그룹에도 적용된다(멤버는 자기 그룹만 알고, 상위 포함은
//     parentName 에서 매번 유도 — 저장하면 부모 변경마다 멤버십 마이그레이션이 필요해진다).
//   · groupNamesOf/groupsOf(표시) = 타점 직접 ∪ 하루 상속 (조상은 pathLabel 툴팁이 이미 보여준다)
//   · appliedGroupNamesOf(필터 판정) = 직접 ∪ 하루 상속 ∪ **조상**
//   · anyGroupAt(없음 판정)     = **그 층위만** — "타점 그룹 없음"은 하루 상속을 안 센다(안 그러면
//     하루 그룹 하나가 미분류 타점을 통째로 가린다).
//   · has/toggle(편집)          = **직접만** — 상속된 그룹을 메뉴에서 "빼기"하면 no-op 이 되는
//     혼란을 막는다(층위 상속은 차트 쪽에서, 계층 상속은 하위 그룹에서 뺀다).
//
// 토글이 **낙관적**인 이유: 차트에서 숫자키를 연타하는 입력이라 왕복을 기다리면 눌린 게 늦게 보이고,
// 매 요청마다 invalidate 하면 연타 중 refetch 가 겹쳐 화면이 되돌아가는 깜빡임이 난다.
// → 캐시를 먼저 고치고, **마지막 요청이 끝났을 때만** 서버와 맞춘다(비행 중인 게 남았으면 건너뜀).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, GroupItemRef, GroupMembership, GroupScope } from "../api/groups.js";
import { attachGroup, detachGroup } from "../api/groups.js";
import { groupsQuery, groupMembershipsQuery } from "../api/queries.js";
import { applyGroupToggle, buildGroupIndex, buildChartGroupIndex, countByGroup } from "./groupIndex.js";
import { ancestorsOf, expandWithAncestors, groupPathLabel, inheritanceSources } from "./groupTree.js";
import { pointKey, chartKey, type PointRef } from "./pointKey.js";

const TOGGLE_KEY = ["group-toggle"];

/** 차트 참조 — (종목,날짜). 하루 소속의 키. */
export interface ChartGroupRef {
    stockCode: string;
    date: string;
}

export interface GroupsView {
    /** 그룹 사전(이름 오름차순 — 서버 정렬 그대로). 좌표·부모·맵도 여기 실려 온다. */
    groups: Group[];
    /** id → 그룹(프리셋 슬롯이 id 를 들고 있어 이름을 되찾을 때). 없는 id = 지워진 그룹. */
    groupByName: Map<string, Group>;
    /**
     * 이 그룹의 조상들(먼 조상이 앞) — 이름은 부모 밑에서만 뜻이 선다(같은 이름이 두 부모 밑에 있을 수 있다).
     * 규칙(끊긴 사슬·순환·깊이)은 groupTree(순수·테스트됨)에.
     */
    ancestorsOf: (groupName: string) => Group[];
    /** 조상+자신을 한 줄로 — 좁은 자리의 툴팁은 이걸 쓴다. */
    pathLabel: (groupName: string, fallback: string) => string;
    /** 이 타점에 적용되는 그룹(이름순) — **직접 ∪ 하루 상속**. */
    groupsOf: (point: PointRef) => Group[];
    /** 하루(차트) 층위 소속 그룹 — 그룹은 하루 전용이라 칩 표시는 전부 이걸 쓴다. */
    chartGroupsOf: (chart: ChartGroupRef) => Group[];
    /** 표시용 적용 id — **직접 ∪ 하루 상속**(조상 제외 — 칩이 늘어지지 않게, 경로는 pathLabel 로). */
    groupNamesOf: (point: PointRef) => string[];
    /**
     * 판정용 적용 id — **직접 ∪ 하루 상속 ∪ 조상**(계층 상속까지). 그룹 필터가 "테마"를 걸면
     * "테마 ▸ 2차전지" 소속도 잡히는 건 이 함수 덕이다. 시각 없으면 하루 항목으로 판정.
     */
    appliedGroupNamesOf: (ref: GroupItemRef) => string[];
    /**
     * 이 항목에 이 그룹이 **계층 상속으로만** 적용되나 — 그렇다면 상속을 가져온 직접 그룹(경유지).
     * 팝오버가 흐린 행("하위 ○○ 경유")을 그리고 토글을 막는 근거. 직접 소속이거나 무관하면 null.
     */
    inheritedViaOf: (ref: GroupItemRef, groupName: string) => Group | null;
    /**
     * 이 항목에 **그 층위** 소속이 하나라도 있나 — "…그룹 없음" 필터 판정의 유일한 출처.
     *   · day   = 그 차트의 하루 소속(타점 항목이면 제 날짜의 차트를 본다)
     *   · point = 타점 **직접** 소속 — 하루 상속은 안 센다. 그게 층위별로 묻는 이유 전부다:
     *     합집합에 0개를 물으면 하루 그룹 하나가 "아직 분류 안 한 타점"을 통째로 가린다.
     * 시각 없는 항목에 point 를 물으면 **undefined**(판단 불가) — 타점이 아직 없는 하루라 답이 없다.
     * 조상은 볼 필요가 없다: 조상 소속은 직접 소속이 있을 때만 생기므로 "0개냐"를 안 바꾼다.
     */
    anyGroupAt: (ref: GroupItemRef, scope: GroupScope) => boolean | undefined;
    /** 직접 소속 여부(편집 판정 — 상속은 안 본다). */
    has: (point: PointRef, groupName: string) => boolean;
    /** 이 그룹의 사용 건수(두 층위 합산 — 삭제 확인·팔레트 빈도). */
    countOf: (groupName: string) => number;
    /** 소속 토글(낙관적). on 생략 = 현재 **직접** 상태의 반대. */
    toggle: (point: PointRef, groupName: string, on?: boolean) => void;
    /** 차트의 하루 소속 그룹 id들(직접만 — 골격 패널의 편집·표시 판정). */
    chartGroupNamesOf: (chart: ChartGroupRef) => string[];
    /** 하루 소속 토글(낙관적). on 생략 = 현재 상태의 반대. */
    toggleChart: (chart: ChartGroupRef, groupName: string, on?: boolean) => void;
    /** 전 항목 멤버십 원본 — 겹침(징검다리) 계산처럼 접지 않은 피드가 필요한 곳에서 쓴다. */
    memberships: GroupMembership[];
    isLoading: boolean;
}

/**
 * ⚠ **직접 부르지 말 것** — GroupsProvider 가 유일한 호출자다(소비는 GroupsContext 의 useGroups).
 * 인스턴스마다 멤버십 피드 전체를 훑어 색인 셋(타점·차트·빈도)을 새로 만들기 때문에, 부르는 화면 수만큼
 * 같은 계산이 돈다. 낙관적 토글도 인스턴스가 여럿이라 mutationKey 로 서로를 세어 조율하고 있었다 —
 * 한 벌이면 그 조율이 애초에 필요 없다.
 */
export function useGroupsValue(): GroupsView {
    const qc = useQueryClient();
    const groupsQ = useQuery(groupsQuery());
    const memberQ = useQuery(groupMembershipsQuery());

    const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
    const memberships = useMemo(() => memberQ.data ?? [], [memberQ.data]);
    const groupByName = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups]);
    const index = useMemo(() => buildGroupIndex(memberships), [memberships]);
    const chartIndex = useMemo(() => buildChartGroupIndex(memberships), [memberships]);
    const counts = useMemo(() => countByGroup(memberships), [memberships]);

    // 옛 nameOf(id→이름) 조회가 사라졌다 — 이름이 곧 키라 정렬 기준이 키 자신이고,
    // "막 만든 그룹이 사전에 아직 없어 id 로 정렬되는" 경계 조건도 함께 없어졌다.
    const memberKey = groupMembershipsQuery().queryKey;
    const toggleMut = useMutation({
        mutationKey: TOGGLE_KEY,
        mutationFn: ({ item, groupName, on }: { item: GroupItemRef; groupName: string; on: boolean }) =>
            on ? attachGroup(groupName, item) : detachGroup(groupName, item),
        onMutate: ({ item, groupName, on }) => {
            qc.setQueryData<GroupMembership[]>(memberKey, (cur) => applyGroupToggle(cur ?? [], item, groupName, on));
        },
        // 실패·성공 모두 마지막 한 건에서만 서버와 동기(연타 중엔 낙관적 상태 유지).
        onSettled: () => {
            if (qc.isMutating({ mutationKey: TOGGLE_KEY }) <= 1) void qc.invalidateQueries({ queryKey: memberKey });
        },
    });

    return useMemo(() => {
        const directOf = (p: PointRef): string[] => index.get(pointKey(p)) ?? [];
        const chartOf = (c: ChartGroupRef): string[] => chartIndex.get(chartKey(c)) ?? [];
        // 층위 상속 합치기 — 직접이 앞(편집 대상이 먼저 보이게), 하루 상속이 뒤. 중복은 Set 으로 거른다.
        const idsOf = (p: PointRef): string[] => {
            const direct = directOf(p);
            const inherited = chartOf(p);
            if (inherited.length === 0) return direct;
            return [...new Set([...direct, ...inherited])];
        };
        /** 항목의 직접 소속(층위 상속 포함, 계층 상속 제외) — 판정·경유 계산의 재료. */
        const baseOf = (ref: GroupItemRef): string[] =>
            ref.time === undefined ? chartOf(ref) : idsOf(ref as PointRef);
        return {
            groups,
            groupByName,
            ancestorsOf: (id) => ancestorsOf(id, groupByName),
            pathLabel: (id, fallback) => groupPathLabel(id, groupByName, fallback),
            groupsOf: (p) => idsOf(p).map((id) => groupByName.get(id)).filter((g): g is Group => g != null),
            groupNamesOf: idsOf,
            appliedGroupNamesOf: (ref) => expandWithAncestors(baseOf(ref), groupByName),
            inheritedViaOf: (ref, groupName) => inheritanceSources(baseOf(ref), groupByName).get(groupName) ?? null,
            anyGroupAt: (ref, scope) =>
                scope === "day"
                    ? chartOf(ref).length > 0
                    : ref.time === undefined ? undefined : directOf(ref as PointRef).length > 0,
            has: (p, groupName) => directOf(p).includes(groupName),
            countOf: (groupName) => counts.get(groupName) ?? 0,
            toggle: (p, groupName, on) =>
                toggleMut.mutate({ item: p, groupName, on: on ?? !directOf(p).includes(groupName) }),
            chartGroupNamesOf: chartOf,
            chartGroupsOf: (c) => chartOf(c).map((id) => groupByName.get(id)).filter((g): g is Group => g != null),
            toggleChart: (c, groupName, on) =>
                toggleMut.mutate({ item: { stockCode: c.stockCode, date: c.date }, groupName, on: on ?? !chartOf(c).includes(groupName) }),
            memberships,
            isLoading: groupsQ.isLoading || memberQ.isLoading,
        };
        // mutation 은 매 렌더 새 객체(useMutation) — 의존성에 넣으면 매번 재생성되므로 제외(mutate 는 안정).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, groupByName, index, chartIndex, counts, memberships, groupsQ.isLoading, memberQ.isLoading]);
}
