// 그룹 한 벌 — 차트 카드·타점 정보 패널·그룹 메뉴·시트/필터·골격 패널이 공유한다.
// 사전(groups)과 부착(attachments)을 늘 같이 쓰므로 훅 하나로 준다(팔레트 = 사전 + 빈도).
//
// 부착이 두 벌이다: 타점 부착 + **차트 부착**(골격 분류 — 타점 없는 차트도 대상). 사전은 공유.
// **상속 규칙**: 차트 그룹는 그 차트의 모든 타점에 적용된다(anchorAppliesTo 와 같은 꼴). 그래서
//   · groupIdsOf/groupsOf(표시·필터) = 타점 직접 부착 ∪ 차트 부착
//   · has/toggle(편집)          = **직접 부착만** — 상속된 그룹를 타점 메뉴에서 "떼기"하면 no-op 이 되는
//     혼란을 막는다(상속을 떼려면 차트에서 뗀다).
//
// 토글이 **낙관적**인 이유: 차트에서 숫자키를 연타하는 입력이라 왕복을 기다리면 눌린 게 늦게 보이고,
// 매 요청마다 invalidate 하면 연타 중 refetch 가 겹쳐 화면이 되돌아가는 깜빡임이 난다.
// → 캐시를 먼저 고치고, **마지막 요청이 끝났을 때만** 서버와 맞춘다(비행 중인 게 남았으면 건너뜀).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, GroupAttachment, ChartGroupAttachment } from "../api/groups.js";
import { attachGroup, detachGroup, attachChartGroup, detachChartGroup } from "../api/groups.js";
import { groupsQuery, groupAttachmentsQuery, chartGroupAttachmentsQuery } from "../api/queries.js";
import { applyGroupToggle, applyChartGroupToggle, buildGroupIndex, buildChartGroupIndex, countByGroup } from "./groupIndex.js";
import { pointKey, chartKey, type PointRef } from "./pointKey.js";

const TOGGLE_KEY = ["group-toggle"];
const CHART_TOGGLE_KEY = ["chart-group-toggle"];

/** 차트 참조 — (종목,날짜). api ChartRef 와 구조 동일. */
export interface ChartGroupRef {
    stockCode: string;
    date: string;
}

export interface GroupsView {
    /** 그룹 사전(이름 오름차순 — 서버 정렬 그대로). */
    groups: Group[];
    /** id → 그룹(프리셋 슬롯이 id 를 들고 있어 이름을 되찾을 때). 없는 id = 지워진 그룹. */
    groupById: Map<string, Group>;
    /** 이 타점에 적용되는 그룹(이름순) — **직접 ∪ 차트 상속**. */
    groupsOf: (point: PointRef) => Group[];
    /** 적용 그룹 id만(필터 평가용) — **직접 ∪ 차트 상속**. 없으면 빈 배열. */
    groupIdsOf: (point: PointRef) => string[];
    /** 직접 부착 여부(편집 판정 — 상속은 안 본다). */
    has: (point: PointRef, groupId: string) => boolean;
    /** 이 그룹의 사용 건수(타점+차트 합산 — 삭제 확인·팔레트 빈도). */
    countOf: (groupId: string) => number;
    /** 부착 토글(낙관적). on 생략 = 현재 **직접** 상태의 반대. */
    toggle: (point: PointRef, groupId: string, on?: boolean) => void;
    /** 여러 그룹를 한 방향으로(프리셋 조합). 각 건이 낙관적이라 화면은 즉시 다 바뀐다. */
    applyGroups: (point: PointRef, groupIds: string[], on: boolean) => void;
    /** 차트의 소유 그룹 id들(직접만 — 골격 패널의 편집·표시 판정). */
    chartGroupIdsOf: (chart: ChartGroupRef) => string[];
    /** 차트 부착 토글(낙관적). on 생략 = 현재 상태의 반대. */
    toggleChart: (chart: ChartGroupRef, groupId: string, on?: boolean) => void;
    isLoading: boolean;
}

export function useGroups(): GroupsView {
    const qc = useQueryClient();
    const groupsQ = useQuery(groupsQuery());
    const attQ = useQuery(groupAttachmentsQuery());
    const chartAttQ = useQuery(chartGroupAttachmentsQuery());

    const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
    const attachments = useMemo(() => attQ.data ?? [], [attQ.data]);
    const chartAttachments = useMemo(() => chartAttQ.data ?? [], [chartAttQ.data]);
    const groupById = useMemo(() => new Map(groups.map((t) => [t.id, t])), [groups]);
    const index = useMemo(() => buildGroupIndex(attachments), [attachments]);
    const chartIndex = useMemo(() => buildChartGroupIndex(chartAttachments), [chartAttachments]);
    const counts = useMemo(() => countByGroup(attachments, chartAttachments), [attachments, chartAttachments]);

    // 낙관적 삽입의 정렬 기준. 렌더 스냅숏(groupById)이 우선이되, **막 만든 그룹**는 아직 거기 없다 —
    // 생성 흐름(BulkGroupMenu)이 사전 캐시에 먼저 심으므로 라이브 캐시를 폴백으로 봐야 id 정렬로 안 빠진다.
    const nameOf = (id: string): string =>
        groupById.get(id)?.name ?? qc.getQueryData<Group[]>(groupsQuery().queryKey)?.find((t) => t.id === id)?.name ?? id;

    const attKey = groupAttachmentsQuery().queryKey;
    const toggleMut = useMutation({
        mutationKey: TOGGLE_KEY,
        mutationFn: ({ point, groupId, on }: { point: PointRef; groupId: string; on: boolean }) =>
            on ? attachGroup(groupId, point) : detachGroup(groupId, point),
        onMutate: ({ point, groupId, on }) => {
            qc.setQueryData<GroupAttachment[]>(attKey, (cur) => applyGroupToggle(cur ?? [], point, groupId, on, nameOf));
        },
        // 실패·성공 모두 마지막 한 건에서만 서버와 동기(연타 중엔 낙관적 상태 유지).
        onSettled: () => {
            if (qc.isMutating({ mutationKey: TOGGLE_KEY }) <= 1) void qc.invalidateQueries({ queryKey: attKey });
        },
    });

    const chartAttKey = chartGroupAttachmentsQuery().queryKey;
    const chartToggleMut = useMutation({
        mutationKey: CHART_TOGGLE_KEY,
        mutationFn: ({ chart, groupId, on }: { chart: ChartGroupRef; groupId: string; on: boolean }) =>
            on ? attachChartGroup(groupId, chart) : detachChartGroup(groupId, chart),
        onMutate: ({ chart, groupId, on }) => {
            qc.setQueryData<ChartGroupAttachment[]>(chartAttKey, (cur) => applyChartGroupToggle(cur ?? [], chart, groupId, on, nameOf));
        },
        onSettled: () => {
            if (qc.isMutating({ mutationKey: CHART_TOGGLE_KEY }) <= 1) void qc.invalidateQueries({ queryKey: chartAttKey });
        },
    });

    return useMemo(() => {
        const directOf = (p: PointRef): string[] => index.get(pointKey(p)) ?? [];
        const chartOf = (c: ChartGroupRef): string[] => chartIndex.get(chartKey(c)) ?? [];
        // 상속 합치기 — 직접이 앞(편집 대상이 먼저 보이게), 차트 상속이 뒤. 중복은 Set 으로 거른다.
        const idsOf = (p: PointRef): string[] => {
            const direct = directOf(p);
            const inherited = chartOf(p);
            if (inherited.length === 0) return direct;
            return [...new Set([...direct, ...inherited])];
        };
        return {
            groups,
            groupById,
            groupsOf: (p) => idsOf(p).map((id) => groupById.get(id)).filter((t): t is Group => t != null),
            groupIdsOf: idsOf,
            has: (p, groupId) => directOf(p).includes(groupId),
            countOf: (groupId) => counts.get(groupId) ?? 0,
            toggle: (p, groupId, on) => toggleMut.mutate({ point: p, groupId, on: on ?? !directOf(p).includes(groupId) }),
            applyGroups: (p, groupIds, on) => { for (const id of groupIds) toggleMut.mutate({ point: p, groupId: id, on }); },
            chartGroupIdsOf: chartOf,
            toggleChart: (c, groupId, on) => chartToggleMut.mutate({ chart: c, groupId, on: on ?? !chartOf(c).includes(groupId) }),
            isLoading: groupsQ.isLoading || attQ.isLoading || chartAttQ.isLoading,
        };
        // 두 mutation 은 매 렌더 새 객체(useMutation) — 의존성에 넣으면 매번 재생성되므로 제외(mutate 는 안정).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, groupById, index, chartIndex, counts, groupsQ.isLoading, attQ.isLoading, chartAttQ.isLoading]);
}
