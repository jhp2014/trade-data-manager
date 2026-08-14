// 패널을 **실제로 그려 보는** 테스트의 발판 — 프로바이더 배선 + 쿼리 캐시 미리 채우기.
//
// 왜 캐시를 미리 채우나(mock fetch 가 아니라): 이 앱의 화면은 react-query 캐시를 읽는다. 캐시에 값을
// 심어 두면 **네트워크가 아예 없는 상태로** 로딩 없이 첫 렌더부터 완성된 화면이 나온다 — 비동기 대기가
// 사라지니 테스트가 빠르고, 무엇보다 "무슨 데이터로 그린 화면인가"가 테스트 본문에 그대로 보인다.
//
// 프로바이더 순서는 **실제 배선과 같아야 한다**(main.tsx): 그룹·축 → 깔때기. 깔때기가 둘을 재료로 쓰므로
// 뒤집으면 실행되긴 해도 테스트가 실제와 다른 그래프를 검증하게 된다.
import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { AnchoredChart, AxisLine, CandidateDay, ComputedAxisFeed, RankAxis, ReviewPointListItem, SkeletonFeed } from "@trade-data-manager/wire";
import type { Group, GroupMembership } from "../api/groups.js";
import {
    allPointsQuery, anchoredChartsQuery, axisLinesQuery, candidateDaysQuery, computedAxesQuery,
    groupMembershipsQuery, groupsQuery, rankAxesQuery, skeletonsQuery,
} from "../api/queries.js";
import { FunnelProvider } from "../panels/filter/FunnelContext.js";
import { GroupsProvider } from "../lib/GroupsContext.js";
import { RankAxesProvider } from "../lib/RankAxesContext.js";

/** 심을 수 있는 피드들 — 안 준 것은 **빈 값**으로 심는다(로딩 상태가 남지 않게). */
export interface Seed {
    skeletons?: SkeletonFeed;
    points?: ReviewPointListItem[];
    anchoredCharts?: AnchoredChart[];
    candidateDays?: CandidateDay[];
    groups?: Group[];
    memberships?: GroupMembership[];
    axes?: RankAxis[];
    axisLines?: AxisLine[];
    computedAxes?: ComputedAxisFeed[];
}

const EMPTY_SKELETONS: SkeletonFeed = { daily: [], minute: [], levels: [] };

/**
 * 캐시를 채운 QueryClient. retry·refetch 를 전부 끈다 — 켜져 있으면 테스트가 끝난 뒤에도 타이머가
 * 남아 다음 테스트로 샌다.
 */
export function seededClient(seed: Seed = {}): QueryClient {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnMount: false, refetchOnWindowFocus: false, gcTime: Infinity } },
    });
    qc.setQueryData(skeletonsQuery().queryKey, seed.skeletons ?? EMPTY_SKELETONS);
    qc.setQueryData(allPointsQuery().queryKey, seed.points ?? []);
    qc.setQueryData(anchoredChartsQuery().queryKey, seed.anchoredCharts ?? []);
    qc.setQueryData(candidateDaysQuery().queryKey, seed.candidateDays ?? []);
    qc.setQueryData(groupsQuery().queryKey, seed.groups ?? []);
    qc.setQueryData(groupMembershipsQuery().queryKey, seed.memberships ?? []);
    qc.setQueryData(rankAxesQuery().queryKey, seed.axes ?? []);
    qc.setQueryData(axisLinesQuery().queryKey, seed.axisLines ?? []);
    qc.setQueryData(computedAxesQuery().queryKey, seed.computedAxes ?? []);
    return qc;
}

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }): ReactElement {
    return (
        <QueryClientProvider client={client}>
            <GroupsProvider>
                <RankAxesProvider>
                    <FunnelProvider>{children}</FunnelProvider>
                </RankAxesProvider>
            </GroupsProvider>
        </QueryClientProvider>
    );
}

/** 패널 하나를 실제 배선 위에 그린다. */
export function renderWithProviders(ui: ReactElement, seed: Seed = {}): RenderResult & { client: QueryClient } {
    const client = seededClient(seed);
    const result = render(<Providers client={client}>{ui}</Providers>);
    return { ...result, client };
}
