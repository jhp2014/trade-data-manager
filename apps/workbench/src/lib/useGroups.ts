// 그룹 한 벌 — 차트 카드·타점 정보 패널·시트/필터·정규화 패널이 공유한다.
// 사전(groups)과 멤버십을 늘 같이 쓰므로 훅 하나로 준다(팔레트 = 사전 + 빈도).
//
// **항목은 언제나 차트(종목, 날짜)다** — 2026-09-01 타점 층위 폐지로 그룹이 붙는 자리가 하나가 됐다.
// ⚠ 그래도 **층위 상속은 살아 있다**: 타점 행에 그룹을 물으면 호출부(useFilterFunnel)가 시각을 벗겨
// 그날 차트로 묻기 때문에, 하루 그룹은 그날 타점 전부에 그대로 적용된다(깔때기의 day→point ∀ 전개).
// 사라진 건 *저장된* 층위지 *적용*이 아니다 — 여기 함수들이 차트 참조만 받는 것도 그래서다.
// 상속 둘:
//   · 층위 상속: 하루 그룹 → 그날의 모든 타점(위 문단 — 이 훅 바깥에서 키를 접어 일어난다).
//   · 계층 상속: 자식 그룹 소속이면 조상 그룹에도 적용된다(멤버는 자기 그룹만 알고, 상위 포함은
//     parentName 에서 매번 유도 — 저장하면 부모 변경마다 멤버십 마이그레이션이 필요해진다).
//   · chartGroupNamesOf/chartGroupsOf(표시) = 직접만 (조상은 pathLabel 툴팁이 이미 보여준다)
//   · appliedGroupNamesOf(필터 판정) = 직접 ∪ **조상**
//   · anyGroupAt(없음 판정) = 직접 0개냐 — 조상은 볼 필요가 없다(조상 소속은 직접 소속이 있을 때만
//     생기므로 "0개냐"를 안 바꾼다).
//
// 토글이 **낙관적**인 이유: 차트에서 숫자키를 연타하는 입력이라 왕복을 기다리면 눌린 게 늦게 보이고,
// 매 요청마다 invalidate 하면 연타 중 refetch 가 겹쳐 화면이 되돌아가는 깜빡임이 난다.
// → 캐시를 먼저 고치고, **마지막 요청이 끝났을 때만** 서버와 맞춘다(비행 중인 게 남았으면 건너뜀).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, GroupItemRef, GroupMembership } from "../api/groups.js";
import { attachGroup, detachGroup } from "../api/groups.js";
import { groupsQuery, groupMembershipsQuery } from "../api/queries.js";
import { applyGroupToggle, buildGroupIndex, countByGroup } from "./groupIndex.js";
import { ancestorsOf, expandWithAncestors, groupPathLabel, inheritanceSources } from "./groupTree.js";
import { chartKey } from "./pointKey.js";

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
    /** 이 차트에 붙은 그룹(이름순) — 칩 표시는 전부 이걸 쓴다. */
    chartGroupsOf: (chart: ChartGroupRef) => Group[];
    /**
     * 판정용 적용 id — **직접 ∪ 조상**(계층 상속). 그룹 필터가 "테마"를 걸면
     * "테마 ▸ 2차전지" 소속도 잡히는 건 이 함수 덕이다.
     */
    appliedGroupNamesOf: (ref: GroupItemRef) => string[];
    /**
     * 이 항목에 이 그룹이 **계층 상속으로만** 적용되나 — 그렇다면 상속을 가져온 직접 그룹(경유지).
     * 팝오버가 흐린 행("하위 ○○ 경유")을 그리고 토글을 막는 근거. 직접 소속이거나 무관하면 null.
     */
    inheritedViaOf: (ref: GroupItemRef, groupName: string) => Group | null;
    /**
     * 이 차트에 그룹이 하나라도 붙어 있나 — "그룹 없음" 필터 판정의 유일한 출처.
     * 조상은 볼 필요가 없다: 조상 소속은 직접 소속이 있을 때만 생기므로 "0개냐"를 안 바꾼다.
     */
    anyGroupAt: (ref: GroupItemRef) => boolean;
    /** 이 그룹의 사용 건수(삭제 확인·팔레트 빈도). */
    countOf: (groupName: string) => number;
    /** 차트에 붙은 그룹 이름들(직접만 — 표시·편집 판정). */
    chartGroupNamesOf: (chart: ChartGroupRef) => string[];
    /** 소속 토글(낙관적). on 생략 = 현재 상태의 반대. */
    toggleChart: (chart: ChartGroupRef, groupName: string, on?: boolean) => void;
    /** 전 항목 멤버십 원본 — 겹침(징검다리) 계산처럼 접지 않은 피드가 필요한 곳에서 쓴다. */
    memberships: GroupMembership[];
    isLoading: boolean;
}

/**
 * ⚠ **직접 부르지 말 것** — GroupsProvider 가 유일한 호출자다(소비는 GroupsContext 의 useGroups).
 * 인스턴스마다 멤버십 피드 전체를 훑어 색인(차트·빈도)을 새로 만들기 때문에, 부르는 화면 수만큼
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
    const chartIndex = useMemo(() => buildGroupIndex(memberships), [memberships]);
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
        const chartOf = (c: ChartGroupRef): string[] => chartIndex.get(chartKey(c)) ?? [];
        return {
            groups,
            groupByName,
            ancestorsOf: (id) => ancestorsOf(id, groupByName),
            pathLabel: (id, fallback) => groupPathLabel(id, groupByName, fallback),
            appliedGroupNamesOf: (ref) => expandWithAncestors(chartOf(ref), groupByName),
            inheritedViaOf: (ref, groupName) => inheritanceSources(chartOf(ref), groupByName).get(groupName) ?? null,
            anyGroupAt: (ref) => chartOf(ref).length > 0,
            countOf: (groupName) => counts.get(groupName) ?? 0,
            chartGroupNamesOf: chartOf,
            chartGroupsOf: (c) => chartOf(c).map((id) => groupByName.get(id)).filter((g): g is Group => g != null),
            toggleChart: (c, groupName, on) =>
                toggleMut.mutate({ item: { stockCode: c.stockCode, date: c.date }, groupName, on: on ?? !chartOf(c).includes(groupName) }),
            memberships,
            isLoading: groupsQ.isLoading || memberQ.isLoading,
        };
        // mutation 은 매 렌더 새 객체(useMutation) — 의존성에 넣으면 매번 재생성되므로 제외(mutate 는 안정).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, groupByName, chartIndex, counts, memberships, groupsQ.isLoading, memberQ.isLoading]);
}
