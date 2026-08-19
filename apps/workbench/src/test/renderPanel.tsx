// 패널을 **실제로 그려 보는** 테스트의 발판 — 프로바이더 배선 + 쿼리 캐시 미리 채우기.
//
// 왜 캐시를 미리 채우나(mock fetch 가 아니라): 이 앱의 화면은 react-query 캐시를 읽는다. 캐시에 값을
// 심어 두면 **네트워크가 아예 없는 상태로** 로딩 없이 첫 렌더부터 완성된 화면이 나온다 — 비동기 대기가
// 사라지니 테스트가 빠르고, 무엇보다 "무슨 데이터로 그린 화면인가"가 테스트 본문에 그대로 보인다.
//
// 프로바이더 순서는 **실제 배선과 같아야 한다**(main.tsx): 이름 → 그룹·축 → 깔때기. 깔때기가 뒤를
// 재료로 쓰므로 뒤집으면 실행되긴 해도 테스트가 실제와 다른 그래프를 검증하게 된다.
import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { AnchoredChart, AxisLine, CandidateDay, ChartBundle, ComputedAxisFeed, DayReplay, RankAxis, ReviewPointListItem, SkeletonFeed, StockMeta } from "@trade-data-manager/wire";
import type { Group, GroupMembership } from "../api/groups.js";
import {
    allPointsQuery, anchoredChartsQuery, axisLinesQuery, candidateDaysQuery, chartQuery, computedAxesQuery,
    groupMembershipsQuery, groupsQuery, rankAxesQuery, skeletonsQuery, stockMasterQuery,
} from "../api/queries.js";
import { FunnelProvider } from "../panels/filter/FunnelContext.js";
import { GroupsProvider } from "../lib/GroupsContext.js";
import { LiveSnapshotProvider } from "../lib/LiveSnapshotContext.js";
import { RankAxesProvider } from "../lib/RankAxesContext.js";
import { StockNamesProvider } from "../lib/StockNamesContext.js";

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
    /**
     * 그날 복기 파생(테마 선·거래대금의 재료). 키는 골격 패널 전용이다 — 복기 보드와 **일부러 갈라져**
     * 있다(응답이 ~15MB 라 gcTime 이 긴 보드 캐시와 섞이면 힙에 여러 날이 앉는다, useDaySnapshot 참고).
     */
    daySnapshot?: { date: string; data: DayReplay };
    /**
     * 차트 번들(원주가 분봉 + 2년 일봉) — **캔들 오버레이의 재료**. 종목·날짜별이라 목록으로 받는다.
     * 안 심고 캔들을 켜면 setup 의 네트워크 그물에 걸린다(그게 의도다 — 빈 캔들로 통과하지 않게).
     */
    charts?: { code: string; date: string; data: ChartBundle }[];
    /**
     * 종목명 사전(마스터 전량). **안 주면 피드에 실린 이름들로 자동 조립한다** — 실제 서버에서도
     * 피드의 이름이 같은 마스터에서 나오므로(상위집합) 그 유도가 거짓이 아니고, 이름을 쓰는 테스트가
     * 사전을 매번 손으로 적지 않아도 된다. 사전에만 있고 피드엔 없는 종목을 세우려면 명시로 준다.
     */
    stockNames?: StockMeta[];
}

const EMPTY_SKELETONS: SkeletonFeed = { daily: [], minute: [], levels: [] };

/** 피드에 실려 온 이름들 → 마스터 사전. 이름 없는 행은 마스터에 없는 종목이므로 뺀다. */
function namesFromFeeds(seed: Seed): StockMeta[] {
    const m = new Map<string, string>();
    for (const p of seed.points ?? []) if (p.name) m.set(p.stockCode, p.name);
    for (const c of seed.anchoredCharts ?? []) if (c.name) m.set(c.stockCode, c.name);
    return [...m].map(([stockCode, name]) => ({ stockCode, name, market: "거래소" }));
}

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
    qc.setQueryData(stockMasterQuery().queryKey, seed.stockNames ?? namesFromFeeds(seed));
    if (seed.daySnapshot) qc.setQueryData(["skeleton-day-src", seed.daySnapshot.date], seed.daySnapshot.data);
    for (const c of seed.charts ?? []) qc.setQueryData(chartQuery(c.code, c.date).queryKey, c.data);
    return qc;
}

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }): ReactElement {
    return (
        <QueryClientProvider client={client}>
            <StockNamesProvider>
                <GroupsProvider>
                    <RankAxesProvider>
                        {/* 실시간 스냅샷 — jsdom 엔 EventSource 가 없어 연결 없이 null 스냅샷(Provider 내부 가드). */}
                        <LiveSnapshotProvider>
                            <FunnelProvider>{children}</FunnelProvider>
                        </LiveSnapshotProvider>
                    </RankAxesProvider>
                </GroupsProvider>
            </StockNamesProvider>
        </QueryClientProvider>
    );
}

/** 패널 하나를 실제 배선 위에 그린다. */
export function renderWithProviders(ui: ReactElement, seed: Seed = {}): RenderResult & { client: QueryClient } {
    const client = seededClient(seed);
    const result = render(<Providers client={client}>{ui}</Providers>);
    return { ...result, client };
}
