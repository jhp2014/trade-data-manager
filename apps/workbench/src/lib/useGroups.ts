// 그룹 한 벌 — 차트 카드·타점 정보 패널·그룹 메뉴·시트/필터·골격 패널·맵이 공유한다.
// 사전(groups)과 멤버십을 늘 같이 쓰므로 훅 하나로 준다(팔레트 = 사전 + 빈도).
//
// **멤버십 피드는 하나**다(옛날엔 타점 부착·차트 부착 둘). 시각 유무로 층위가 갈릴 뿐 같은 사실이라
// 정션도 캐시도 합쳤다. 다만 **상속 규칙**은 그대로다: 하루 그룹은 그 차트의 모든 타점에 적용된다.
//   · groupIdsOf/groupsOf(표시·필터) = 타점 직접 ∪ 하루 상속
//   · has/toggle(편집)          = **직접만** — 상속된 그룹을 타점 메뉴에서 "빼기"하면 no-op 이 되는
//     혼란을 막는다(상속을 빼려면 차트 쪽에서 뺀다).
//
// 토글이 **낙관적**인 이유: 차트에서 숫자키를 연타하는 입력이라 왕복을 기다리면 눌린 게 늦게 보이고,
// 매 요청마다 invalidate 하면 연타 중 refetch 가 겹쳐 화면이 되돌아가는 깜빡임이 난다.
// → 캐시를 먼저 고치고, **마지막 요청이 끝났을 때만** 서버와 맞춘다(비행 중인 게 남았으면 건너뜀).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, GroupItemRef, GroupMembership } from "../api/groups.js";
import { attachGroup, detachGroup } from "../api/groups.js";
import { groupsQuery, groupMembershipsQuery } from "../api/queries.js";
import { applyGroupToggle, buildGroupIndex, buildChartGroupIndex, countByGroup } from "./groupIndex.js";
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
    groupById: Map<string, Group>;
    /** 이 타점에 적용되는 그룹(이름순) — **직접 ∪ 하루 상속**. */
    groupsOf: (point: PointRef) => Group[];
    /** 적용 그룹 id만(필터 평가용) — **직접 ∪ 하루 상속**. 없으면 빈 배열. */
    groupIdsOf: (point: PointRef) => string[];
    /** 직접 소속 여부(편집 판정 — 상속은 안 본다). */
    has: (point: PointRef, groupId: string) => boolean;
    /** 이 그룹의 사용 건수(두 층위 합산 — 삭제 확인·팔레트 빈도). */
    countOf: (groupId: string) => number;
    /** 소속 토글(낙관적). on 생략 = 현재 **직접** 상태의 반대. */
    toggle: (point: PointRef, groupId: string, on?: boolean) => void;
    /** 여러 그룹을 한 방향으로(프리셋 조합). 각 건이 낙관적이라 화면은 즉시 다 바뀐다. */
    applyGroups: (point: PointRef, groupIds: string[], on: boolean) => void;
    /** 차트의 하루 소속 그룹 id들(직접만 — 골격 패널의 편집·표시 판정). */
    chartGroupIdsOf: (chart: ChartGroupRef) => string[];
    /** 하루 소속 토글(낙관적). on 생략 = 현재 상태의 반대. */
    toggleChart: (chart: ChartGroupRef, groupId: string, on?: boolean) => void;
    /** 전 항목 멤버십 원본 — 겹침(징검다리) 계산처럼 접지 않은 피드가 필요한 곳에서 쓴다. */
    memberships: GroupMembership[];
    isLoading: boolean;
}

export function useGroups(): GroupsView {
    const qc = useQueryClient();
    const groupsQ = useQuery(groupsQuery());
    const memberQ = useQuery(groupMembershipsQuery());

    const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
    const memberships = useMemo(() => memberQ.data ?? [], [memberQ.data]);
    const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
    const index = useMemo(() => buildGroupIndex(memberships), [memberships]);
    const chartIndex = useMemo(() => buildChartGroupIndex(memberships), [memberships]);
    const counts = useMemo(() => countByGroup(memberships), [memberships]);

    // 낙관적 삽입의 정렬 기준. 렌더 스냅숏(groupById)이 우선이되, **막 만든 그룹**은 아직 거기 없다 —
    // 생성 흐름(BulkGroupMenu)이 사전 캐시에 먼저 심으므로 라이브 캐시를 폴백으로 봐야 id 정렬로 안 빠진다.
    const nameOf = (id: string): string =>
        groupById.get(id)?.name ?? qc.getQueryData<Group[]>(groupsQuery().queryKey)?.find((g) => g.id === id)?.name ?? id;

    const memberKey = groupMembershipsQuery().queryKey;
    const toggleMut = useMutation({
        mutationKey: TOGGLE_KEY,
        mutationFn: ({ item, groupId, on }: { item: GroupItemRef; groupId: string; on: boolean }) =>
            on ? attachGroup(groupId, item) : detachGroup(groupId, item),
        onMutate: ({ item, groupId, on }) => {
            qc.setQueryData<GroupMembership[]>(memberKey, (cur) => applyGroupToggle(cur ?? [], item, groupId, on, nameOf));
        },
        // 실패·성공 모두 마지막 한 건에서만 서버와 동기(연타 중엔 낙관적 상태 유지).
        onSettled: () => {
            if (qc.isMutating({ mutationKey: TOGGLE_KEY }) <= 1) void qc.invalidateQueries({ queryKey: memberKey });
        },
    });

    return useMemo(() => {
        const directOf = (p: PointRef): string[] => index.get(pointKey(p)) ?? [];
        const chartOf = (c: ChartGroupRef): string[] => chartIndex.get(chartKey(c)) ?? [];
        // 상속 합치기 — 직접이 앞(편집 대상이 먼저 보이게), 하루 상속이 뒤. 중복은 Set 으로 거른다.
        const idsOf = (p: PointRef): string[] => {
            const direct = directOf(p);
            const inherited = chartOf(p);
            if (inherited.length === 0) return direct;
            return [...new Set([...direct, ...inherited])];
        };
        return {
            groups,
            groupById,
            groupsOf: (p) => idsOf(p).map((id) => groupById.get(id)).filter((g): g is Group => g != null),
            groupIdsOf: idsOf,
            has: (p, groupId) => directOf(p).includes(groupId),
            countOf: (groupId) => counts.get(groupId) ?? 0,
            toggle: (p, groupId, on) =>
                toggleMut.mutate({ item: p, groupId, on: on ?? !directOf(p).includes(groupId) }),
            applyGroups: (p, groupIds, on) => { for (const id of groupIds) toggleMut.mutate({ item: p, groupId: id, on }); },
            chartGroupIdsOf: chartOf,
            toggleChart: (c, groupId, on) =>
                toggleMut.mutate({ item: { stockCode: c.stockCode, date: c.date }, groupId, on: on ?? !chartOf(c).includes(groupId) }),
            memberships,
            isLoading: groupsQ.isLoading || memberQ.isLoading,
        };
        // mutation 은 매 렌더 새 객체(useMutation) — 의존성에 넣으면 매번 재생성되므로 제외(mutate 는 안정).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, groupById, index, chartIndex, counts, memberships, groupsQ.isLoading, memberQ.isLoading]);
}
