// 그룹 한 벌 — 차트 카드·타점 정보 패널·시트/필터·정규화 패널이 공유한다.
// 사전(groups)과 멤버십을 늘 같이 쓰므로 훅 하나로 준다(팔레트 = 사전 + 빈도).
//
// 항목은 grain 별 둘이다: **차트(종목, 날짜)** 와 **좌표 라벨(종목, 날짜, 분)** — 후자는 2026-09-09
// 재도입된 타점 grain 멤버십(Point 저장이 아니라 캔들 좌표에 붙은 라벨, wire group.ts). 피드·캐시·
// 토글 키는 grain 별로 분리다(무효화·in-flight 조율이 갈려야 한다). "그룹당 한 grain" 은 관례 —
// 배정 UI 가 그룹 목록을 grain 으로 거른다(이 훅은 검사하지 않는다).
// ⚠ **층위 상속은 살아 있다**: 타점 행에 day 그룹을 물으면 호출부(useFilterFunnel)가 시각을 벗겨
// 그날 차트로 묻기 때문에, 하루 그룹은 그날 타점 전부에 그대로 적용된다(깔때기의 day→point ∀ 전개).
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
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, GroupItemRef, GroupMembership, GroupPointItemRef, PointGroupMembership } from "../api/groups.js";
import {
    attachGroup, detachGroup, attachPointGroup, detachPointGroup,
    createGroup, renameGroup as apiRenameGroup, deleteGroup as apiDeleteGroup, setGroupParent,
} from "../api/groups.js";
import { groupsQuery, groupMembershipsQuery, pointGroupMembershipsQuery } from "../api/queries.js";
import { useWorkbench } from "../store/workbench.js";
import { applyGroupToggle, buildGroupIndex, countByGroup, foldPointIndexToDay } from "./groupIndex.js";
import { ancestorsOf, expandWithAncestors, groupPathLabel, inheritanceSources } from "./groupTree.js";
import { chartKey, pointKey } from "./pointKey.js";

/** 라벨 없는 날의 ∃ 조회 결과 — 고정 참조(대부분의 날이라 매 호출 새 배열이면 소비 memo 가 헛돈다). */
const EMPTY_NAMES: string[] = [];

const TOGGLE_KEY = ["group-toggle"];
// point 토글은 별도 키 — day 와 in-flight 를 섞어 세면 마지막 정산(invalidate)이 엉뚱한 피드로 미뤄진다.
const POINT_TOGGLE_KEY = ["group-toggle-point"];

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

    // ── 좌표 라벨(타점 grain) — day 판과 대칭. 소비자 = 배정 팝오버·깔때기 판정.
    /** 이 좌표에 붙은 그룹 이름들(직접만 — 표시·편집 판정). */
    pointGroupNamesOf: (ref: GroupPointItemRef) => string[];
    /** 판정용 적용 이름 — **직접 ∪ 조상**(계층 상속). day 의 appliedGroupNamesOf 와 대칭. */
    appliedPointGroupNamesOf: (ref: GroupPointItemRef) => string[];
    /** 이 좌표에 이 그룹이 계층 상속으로만 적용되나 — day 의 inheritedViaOf 와 대칭(⚠ 그건 day 전용이다). */
    pointInheritedViaOf: (ref: GroupPointItemRef, groupName: string) => Group | null;
    /**
     * **∃ 상향** — 이 하루의 좌표 라벨들이 가리키는 그룹(직접 ∪ 조상) 합집합. day 층위 행에
     * point 그룹 필터를 걸면 "라벨 타점을 하나라도 가진 날"이 이 조회다. 라벨 없는 날은 빈 배열(고정 참조).
     */
    pointNamesAtDay: (chart: ChartGroupRef) => string[];
    /** 이 그룹의 좌표 라벨 사용 건수. day countOf 와 **합산하지 않는다** — 뜻이 다른 두 수다. */
    pointCountOf: (groupName: string) => number;
    /** 좌표 라벨 토글(낙관적). on 생략 = 현재 상태의 반대. */
    togglePoint: (ref: GroupPointItemRef, groupName: string, on?: boolean) => void;
    /** 전 좌표 라벨 멤버십 원본. */
    pointMemberships: PointGroupMembership[];

    // ── 사전 편집(생성·개명·삭제·부모) — 팝오버가 유일한 입구다(그룹 목록 패널 은퇴).
    //    낙관 없이 await — 연타 입력이 아니고, 실패(중복 이름·순환)를 그 자리서 보여야 한다.
    /** 생성 + 즉시 배정(섹션이 곧 scope — 첫 멤버가 grain 을 확정). time 유무가 grain 이다. */
    createGroupAndAttach: (name: string, item: GroupItemRef | GroupPointItemRef) => Promise<void>;
    renameGroup: (name: string, newName: string) => Promise<void>;
    /** 삭제 — 멤버십(양 grain)도 함께 사라지고 자식 그룹은 부모만 풀린다. 확인은 호출부 몫. */
    deleteGroup: (name: string) => Promise<void>;
    /** 부모 지정(null=최상위). 순환은 서버가 거절한다. */
    setParent: (name: string, parentName: string | null) => Promise<void>;

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
    const pointMemberQ = useQuery(pointGroupMembershipsQuery());

    const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
    const memberships = useMemo(() => memberQ.data ?? [], [memberQ.data]);
    const pointMemberships = useMemo(() => pointMemberQ.data ?? [], [pointMemberQ.data]);
    const groupByName = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups]);
    const chartIndex = useMemo(() => buildGroupIndex(memberships), [memberships]);
    const counts = useMemo(() => countByGroup(memberships), [memberships]);
    const pointIndex = useMemo(() => buildGroupIndex(pointMemberships), [pointMemberships]);
    const pointCounts = useMemo(() => countByGroup(pointMemberships), [pointMemberships]);
    // ∃ 상향 색인 — 하루 한 번 접고(직접 이름), 조상 전개까지 여기서 끝낸다(조회는 맵 lookup 하나).
    const pointDayApplied = useMemo(() => {
        const folded = foldPointIndexToDay(pointMemberships);
        return new Map([...folded].map(([k, names]) => [k, expandWithAncestors(names, groupByName)]));
    }, [pointMemberships, groupByName]);

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

    // ── 사전 편집 — 세 캐시(사전·day 멤버십·point 멤버십)의 무효화 규칙을 여기 한 곳에 모은다.
    //    개명·삭제는 멤버십 피드도 무효화해야 한다: 피드 항목이 그룹 **이름**을 들고 있어서다.
    const invalidateDict = useCallback(
        (withMembers: boolean): Promise<unknown> =>
            Promise.all([
                qc.invalidateQueries({ queryKey: groupsQuery().queryKey }),
                ...(withMembers
                    ? [
                          qc.invalidateQueries({ queryKey: groupMembershipsQuery().queryKey }),
                          qc.invalidateQueries({ queryKey: pointGroupMembershipsQuery().queryKey }),
                      ]
                    : []),
            ]),
        [qc],
    );
    const createGroupAndAttach = useCallback(
        async (name: string, item: GroupItemRef | GroupPointItemRef): Promise<void> => {
            await createGroup(name);
            if ("time" in item && item.time !== undefined) await attachPointGroup(name, item);
            else await attachGroup(name, { stockCode: item.stockCode, date: item.date });
            await invalidateDict(true);
        },
        [invalidateDict],
    );
    const renameGroupCb = useCallback(
        async (name: string, newName: string): Promise<void> => {
            await apiRenameGroup(name, newName);
            // 이름이 곧 참조다 — 그룹 필터 리터럴·저장 집합의 조건 사본이 이 이름을 들고 있으므로
            // 서버 성공 직후 클라 저장물도 따라 바꾼다(안 하면 그 저장물이 즉시 죽은 참조).
            useWorkbench.getState().renameGroupInFilters(name, newName);
            await invalidateDict(true);
        },
        [invalidateDict],
    );
    const deleteGroupCb = useCallback(
        async (name: string): Promise<void> => {
            await apiDeleteGroup(name);
            await invalidateDict(true);
        },
        [invalidateDict],
    );
    const setParentCb = useCallback(
        async (name: string, parentName: string | null): Promise<void> => {
            await setGroupParent(name, parentName);
            await invalidateDict(false); // 멤버십은 그룹 이름만 들고 있어 부모 변경과 무관
        },
        [invalidateDict],
    );

    const pointMemberKey = pointGroupMembershipsQuery().queryKey;
    const pointToggleMut = useMutation({
        mutationKey: POINT_TOGGLE_KEY,
        mutationFn: ({ item, groupName, on }: { item: GroupPointItemRef; groupName: string; on: boolean }) =>
            on ? attachPointGroup(groupName, item) : detachPointGroup(groupName, item),
        onMutate: ({ item, groupName, on }) => {
            qc.setQueryData<PointGroupMembership[]>(pointMemberKey, (cur) => applyGroupToggle(cur ?? [], item, groupName, on));
        },
        onSettled: () => {
            if (qc.isMutating({ mutationKey: POINT_TOGGLE_KEY }) <= 1) void qc.invalidateQueries({ queryKey: pointMemberKey });
        },
    });

    return useMemo(() => {
        const chartOf = (c: ChartGroupRef): string[] => chartIndex.get(chartKey(c)) ?? [];
        const pointOf = (p: GroupPointItemRef): string[] => pointIndex.get(pointKey(p)) ?? [];
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
            pointGroupNamesOf: pointOf,
            pointCountOf: (groupName) => pointCounts.get(groupName) ?? 0,
            togglePoint: (p, groupName, on) =>
                pointToggleMut.mutate({
                    item: { stockCode: p.stockCode, date: p.date, time: p.time },
                    groupName,
                    on: on ?? !pointOf(p).includes(groupName),
                }),
            pointMemberships,
            appliedPointGroupNamesOf: (ref) => expandWithAncestors(pointOf(ref), groupByName),
            pointInheritedViaOf: (ref, groupName) => inheritanceSources(pointOf(ref), groupByName).get(groupName) ?? null,
            pointNamesAtDay: (c) => pointDayApplied.get(chartKey(c)) ?? EMPTY_NAMES,
            createGroupAndAttach,
            renameGroup: renameGroupCb,
            deleteGroup: deleteGroupCb,
            setParent: setParentCb,
            isLoading: groupsQ.isLoading || memberQ.isLoading || pointMemberQ.isLoading,
        };
        // mutation 은 매 렌더 새 객체(useMutation) — 의존성에 넣으면 매번 재생성되므로 제외(mutate 는 안정).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, groupByName, chartIndex, counts, memberships, pointIndex, pointCounts, pointMemberships, pointDayApplied, createGroupAndAttach, renameGroupCb, deleteGroupCb, setParentCb, groupsQ.isLoading, memberQ.isLoading, pointMemberQ.isLoading]);
}
