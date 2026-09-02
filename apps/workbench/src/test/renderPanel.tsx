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
import type { ChartAnchor, ChartBundle, ComputedAxisFeed, DailyCommentListItem, DayReplay, RankSectionBundle, StockMeta, ThemeMember } from "@trade-data-manager/wire";
import { hmsToMinute, type PointGrid, type ReviewPointKey } from "@trade-data-manager/market/domain";
import type { Group, GroupMembership } from "../api/groups.js";
import {
    allAnchorsQuery, allCommentsQuery, allThemeMembersQuery, chartQuery, computedAxesQuery,
    groupMembershipsQuery, groupsQuery, pointGridsQuery, rankSectionsQuery, stockMasterQuery,
} from "../api/queries.js";
import type { DecodedPointGrids } from "../api/pointGrids.js";
import { FunnelProvider } from "../panels/filter/FunnelContext.js";
import { GroupsProvider } from "../lib/GroupsContext.js";
import { LiveSnapshotProvider } from "../lib/LiveSnapshotContext.js";
import { RankAxesProvider } from "../lib/RankAxesContext.js";
import { PointGridsProvider } from "../lib/PointGridsContext.js";
import { StockNamesProvider } from "../lib/StockNamesContext.js";

/**
 * 시드용 타점 행 — 타점은 이제 격자 파생물이라 **심는 것은 격자**다(gridsFromPoints 가 이 목록을
 * 최소 격자로 번역한다 — 픽스처가 (종목,날짜,시각)만 말하면 되게). name 을 함께 적으면 아래
 * namesFromFeeds 가 사전을 자동 조립해 준다(테스트 편의 전용).
 */
export type SeedPoint = ReviewPointKey & { name?: string | null };

/**
 * 타점 시드 → 최소 격자. 각 (종목,날짜)의 시각들이 그대로 자동 Point 가 되도록 레벨을 만든다:
 * 기준선 100 · i번째 시각의 신고가 캔들 high = 101+i · i≥1 은 직전 캔들 고가를 확정 마디로 실어
 * 그 캔들이 **한 레벨씩** 올라타게 한다(레벨당 Point 하나 규칙을 정직하게 통과).
 * 거래대금은 기본 게이트(기준선 50억·재돌파 30억) 위, 캔들은 양봉(bullOnly 기본 통과).
 *
 * ⚠ **detectGrid 의 구조 불변식을 지켜서 만든다**(고점·저점 교대 · 자기 봉 확정 금지 · 0 < renewal ≤ leg).
 * 검출기가 낼 수 없는 격자를 심으면 그 위에서 도는 파생(예 `gridFeatures.pullbackDepthPct` 는 저점
 * 피벗을 훑는다)이 **모든 시드에서 결손**이 되어, 그 축을 만지는 테스트가 코드와 무관하게 초록이 된다.
 */
function gridsFromPoints(points: readonly SeedPoint[]): DecodedPointGrids {
    const byDate = new Map<string, Map<string, PointGrid>>();
    const byChart = new Map<string, SeedPoint[]>();
    for (const p of points) {
        const k = `${p.date}|${p.stockCode}`;
        (byChart.get(k) ?? byChart.set(k, []).get(k)!).push(p);
    }
    for (const [k, list] of byChart) {
        const [date, stockCode] = k.split("|");
        const mins = [...list].map((p) => hmsToMinute(p.time)).sort((a, b) => a - b);
        // 피벗 = (확정 고점, 구간 저점) 쌍의 교대. 고점 i 는 캔들 i 자신이고 확정은 **뒤 봉**(m+1),
        // 저점은 그 사이(m+2)에 한 칸 낮게 둔다 — 눌림 깊이가 실제로 계산되는 최소 구조.
        // 누적 대금은 봉마다 10억씩 단조 증가하는 가짜 값 — 창 파생이 0 이 아니게만 둔다(값 자체는 시험 대상 아님).
        const pivots = mins.slice(0, -1).flatMap((m, i) => [
            { kind: "high" as const, min: m, price: 101 + i, confirmedMin: m + 1, cum: String((2 * i + 2) * 1_000_000_000), cross: i === 0 ? null : { min: m - 1, tv: "1000000000", cum: String((2 * i + 1) * 1_000_000_000) } },
            { kind: "low" as const, min: m + 2, price: 99 + i, confirmedMin: null, cum: String((2 * i + 3) * 1_000_000_000), cross: null },
        ]);
        const grid: PointGrid = {
            base: 100,
            touch: { min: mins[0], tv: "1000000000", cum: "1000000000" },
            pivots,
            newHighs: mins.map((m, i) => ({ min: m, open: 100 + i, high: 101 + i, low: 100 + i, close: 101 + i, tv: "6000000000", cum: String((2 * i + 2) * 1_000_000_000) })),
            prevBase: 100,
            prevBaseKrx: null,
        };
        if (!byDate.has(date)) byDate.set(date, new Map());
        byDate.get(date)!.set(stockCode, grid);
    }
    return { version: 1, byDate };
}

/** 심을 수 있는 피드들 — 안 준 것은 **빈 값**으로 심는다(로딩 상태가 남지 않게). */
export interface Seed {
    points?: SeedPoint[];
    /** 복제본 앵커 테이블(전 param 전량) — 작업셋 모수·배지의 재료. */
    anchors?: ChartAnchor[];
    /** 복제본 코멘트 테이블 — 존재 지도의 메모 배지 재료. */
    comments?: DailyCommentListItem[];
    /**
     * 후보 하루를 세울 (종목,날짜)들 — 파생 캐시가 아니라 **최소 앵커 행**(baseline 1개)으로 심는다.
     * 후보는 이제 복제본 테이블에서 파생되므로(candidateDaysOf) 시드도 그 실경로를 태운다 — 직접 캐시를
     * 심으면 테이블과 후보가 어긋난 세상(실서비스에 없는 상태)을 검증하게 된다. 타점·앵커를 이미 심는
     * 날은 자동으로 후보가 되니 이 필드는 "편집물 없이 후보만 필요한 날"에만 쓴다.
     */
    candidateDays?: { stockCode: string; date: string }[];
    groups?: Group[];
    memberships?: GroupMembership[];
    /** 그날 복기 파생(정규화 패널의 테마·거래대금 재료 — useDaySnapshot 키). */
    daySnapshot?: { date: string; data: DayReplay };
    computedAxes?: ComputedAxisFeed[];
    /**
     * 그날 복기 파생(테마 선·거래대금의 재료). 키는 골격 패널 전용이다 — 복기 보드와 **일부러 갈라져**
     * 있다(응답이 ~15MB 라 gcTime 이 긴 보드 캐시와 섞이면 힙에 여러 날이 앉는다, useDaySnapshot 참고).
     */
    /**
     * 차트 번들(원주가 분봉 + 2년 일봉) — **캔들 오버레이의 재료**. 종목·날짜별이라 목록으로 받는다.
     * 안 심고 캔들을 켜면 setup 의 네트워크 그물에 걸린다(그게 의도다 — 빈 캔들로 통과하지 않게).
     */
    charts?: { code: string; date: string; data: ChartBundle }[];
    /** 순위 단면 번들(테마 강도 필터·패널 카운트의 재료). 안 주면 빈 번들. */
    rankSections?: RankSectionBundle;
    /** 자동 타점 격자(디코딩 후 형태 — usePointGrids 재료). 안 주면 빈 번들(자동 Point 0). */
    pointGrids?: DecodedPointGrids;
    /** 시트 테마 멤버십 전량(테마 인덱스 재료). 안 주면 빈 목록. */
    themeMembers?: ThemeMember[];
    /**
     * 종목명 사전(마스터 전량). **안 주면 피드에 실린 이름들로 자동 조립한다** — 실제 서버에서도
     * 피드의 이름이 같은 마스터에서 나오므로(상위집합) 그 유도가 거짓이 아니고, 이름을 쓰는 테스트가
     * 사전을 매번 손으로 적지 않아도 된다. 사전에만 있고 피드엔 없는 종목을 세우려면 명시로 준다.
     */
    stockNames?: StockMeta[];
}

/** 피드에 실려 온 이름들 → 마스터 사전. 이름 없는 행은 마스터에 없는 종목이므로 뺀다. */
function namesFromFeeds(seed: Seed): StockMeta[] {
    const m = new Map<string, string>();
    for (const p of seed.points ?? []) if (p.name) m.set(p.stockCode, p.name);
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
    // candidateDays 는 최소 앵커 행으로 변환해 테이블에 합류 — 후보 파생(candidateDaysOf)이 실경로로 돈다.
    const seededAnchors = [
        ...(seed.anchors ?? []),
        ...(seed.candidateDays ?? []).map(({ stockCode, date }): ChartAnchor => ({ stockCode, date, param: "baseline", anchorDate: date })),
    ];
    qc.setQueryData(allAnchorsQuery().queryKey, seededAnchors);
    qc.setQueryData(allCommentsQuery().queryKey, seed.comments ?? []);
    qc.setQueryData(groupsQuery().queryKey, seed.groups ?? []);
    qc.setQueryData(groupMembershipsQuery().queryKey, seed.memberships ?? []);
    qc.setQueryData(computedAxesQuery().queryKey, seed.computedAxes ?? []);
    qc.setQueryData(rankSectionsQuery().queryKey, seed.rankSections ?? { version: 1, dates: [], pending: [] });
    // 격자 = 타점의 원천. 명시 격자가 있으면 그대로, 없으면 seed.points 를 최소 격자로 번역한다.
    qc.setQueryData(pointGridsQuery().queryKey, seed.pointGrids ?? gridsFromPoints(seed.points ?? []));
    qc.setQueryData(allThemeMembersQuery().queryKey, seed.themeMembers ?? []);
    qc.setQueryData(stockMasterQuery().queryKey, seed.stockNames ?? namesFromFeeds(seed));
    if (seed.daySnapshot) qc.setQueryData(["day-replay-lru", seed.daySnapshot.date], seed.daySnapshot.data);
    for (const c of seed.charts ?? []) qc.setQueryData(chartQuery(c.code, c.date).queryKey, c.data);
    return qc;
}

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }): ReactElement {
    return (
        <QueryClientProvider client={client}>
            <StockNamesProvider>
                <GroupsProvider>
                    <PointGridsProvider>
                        <RankAxesProvider>
                            {/* 실시간 스냅샷 — jsdom 엔 EventSource 가 없어 연결 없이 null 스냅샷(Provider 내부 가드). */}
                            <LiveSnapshotProvider>
                                <FunnelProvider>{children}</FunnelProvider>
                            </LiveSnapshotProvider>
                        </RankAxesProvider>
                    </PointGridsProvider>
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
