// 골격 겹쳐 그리기의 **데이터 조립 + 필터 판정** — 패널의 읽기 절반.
// 렌더(SVG·라벨·손잡이)와 갈라둔 이유: 여기의 판정 규칙(분봉 필터 확정 규칙·일봉 차트 단위 우회)은
// 사용자 확정 규약이라 바뀔 때마다 정확히 읽혀야 하는데, 900줄 렌더 컴포넌트 안에서는 그게 안 됐다.
// 렌더 상태(선택·호버·확대)는 여기 없다 — 입력은 뷰 모드와 "선택만 보기" 집합뿐이다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { skeletonsQuery, anchoredChartsQuery, allPointsQuery } from "../../api/queries.js";
import { useRankFilterResult } from "../rank/useRankFilterResult.js";
import { evalGroupExpr, isGroupExprEmpty } from "../rank/groupFilter.js";
import { useWorkbench } from "../../store/workbench.js";
import { pointKey, chartKey } from "../../lib/pointKey.js";
import {
    normalizeSkeleton, pointSkeletons,
    type ChartSkeleton, type OverlayLine, type SkeletonAnchor,
} from "./skeletonOverlay.js";
import type { GroupsView } from "../../lib/useGroups.js";
import type { SkeletonWireLevel } from "../../api/skeletons.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";

export interface OverlayData {
    feedLoading: boolean;
    /** 화면의 선들 — 일봉은 차트 단위, 분봉은 타점 단위(kind 로 갈린다). */
    lines: OverlayLine[];
    /** 필터 전 모집단 수 — 헤더의 "N개 / M" 분모. */
    population: number;
    /** 분봉에서 전일 종가(%p 분모) 미수집으로 **못 그린** 차트 수 — 필터로 빠진 것과 구분해 보여야 한다. */
    missingPrevClose: number;
    levelsByChart: Map<string, SkeletonWireLevel[]>;
    /** 차트키 → 그 차트의 저장 타점들(시간 오름차순). 필터와 무관한 전체(선은 사실을 그린다). */
    pointsByChart: Map<string, ReviewPointListItem[]>;
    nameOf: (code: string) => string;
}

export function useOverlayData(
    isDaily: boolean,
    anchor: SkeletonAnchor,
    /** "선택만 보기" — null 이면 제한 없음. 렌더 쪽 선택 상태에서 내려온다. */
    onlyCharts: ReadonlySet<string> | null,
    /** 그룹 뷰 — 패널과 같은 인스턴스를 받는다(두 번 만들면 인덱스 memo 가 두 벌 돈다). */
    groupsView: GroupsView,
): OverlayData {
    const feedQ = useQuery(skeletonsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const r = useRankFilterResult();

    // 분봉 필터 확정 규칙(사용자 확정 — 후자): 필터는 **타점 알갱이**로 작동한다. 분봉 뷰는 선=타점이라
    // 매칭 타점만 남는다. "매칭 타점을 가진 차트" 식의 차트 단위 우회는 일봉 패널 전용으로 남는다.
    const filterActive = !r.isEmpty;
    const matchedPks = useMemo<ReadonlySet<string> | null>(
        () => (!isDaily && filterActive ? new Set(r.points.map((p) => pointKey(p))) : null),
        [isDaily, filterActive, r.points],
    );

    // 종목명 — r.nameOf 는 타점 목록에서 모으므로 타점 없는 차트는 코드만 남는다. 앵커 걸린 차트 피드가
    // 이름을 달고 오니(서버 MasterCache.attachNames) 그걸 먼저 보고, 없으면 기존 경로.
    const chartsQ = useQuery(anchoredChartsQuery());
    const nameOf = useMemo(() => {
        const m = new Map<string, string>();
        for (const c of chartsQ.data ?? []) if (c.name) m.set(c.stockCode, c.name);
        return (code: string): string => m.get(code) ?? r.nameOf(code);
    }, [chartsQ.data, r.nameOf]);

    const pointsByChart = useMemo(() => {
        const m = new Map<string, ReviewPointListItem[]>();
        for (const p of pointsQ.data ?? []) {
            const k = chartKey(p);
            const list = m.get(k);
            if (list) list.push(p);
            else m.set(k, [p]);
        }
        for (const list of m.values()) list.sort((a, b) => (a.time < b.time ? -1 : 1));
        return m;
    }, [pointsQ.data]);

    // ── 차트 단위 필터 — **일봉 패널 전용**: 골격의 모집단이 차트라, 타점 조건과 차트 조건을 갈라서 판정한다.
    //  · 밴드·계산축 값구간·시간대 = **타점 전용 조건**(차트엔 그 값이 없다 — 판정은 필터 훅 r.pointOnlyActive)
    //    → 활성이면 매칭 타점을 가진 차트만(타점 없는 차트는 판정 자체가 안 되므로 빠진다).
    //  · 날짜·그룹 = 차트에서도 판정 가능 → 차트 자체로 평가한다. 그룹는 **차트 직접 부착 ∪ 그 타점들의
    //    그룹**(상속 포함)라 어느 쪽에 붙었든 잡힌다. 이 경로가 타점 경로의 상위집합이라 합집합이 필요 없다.
    // 분봉 패널은 이 우회를 안 탄다(사용자 확정) — 선=타점이라 matchedPks 가 직접 거른다(아래 pointLines).
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const groupExpr = useWorkbench((s) => s.groupExpr);
    const pointOnlyActive = r.pointOnlyActive;

    const chartAllowed = useMemo<ReadonlySet<string> | null>(() => {
        if (!isDaily) return null;
        if (pointOnlyActive) return new Set(r.points.map((p) => chartKey(p)));
        const dateActive = dateRanges.length > 0;
        const groupActive = !isGroupExprEmpty(groupExpr);
        if (!dateActive && !groupActive) return null; // 무필터 = 전 차트
        const feed = feedQ.data;
        if (!feed) return new Set();
        const out = new Set<string>();
        for (const e of feed.daily) {
            const key = chartKey(e);
            if (dateActive && !dateRanges.some((rg) => e.date >= rg.from && e.date <= rg.to)) continue;
            if (groupActive) {
                const ids = new Set(groupsView.chartGroupIdsOf(e));
                for (const p of pointsByChart.get(key) ?? []) for (const id of groupsView.groupIdsOf(p)) ids.add(id);
                if (!evalGroupExpr([...ids], groupExpr)) continue;
            }
            out.add(key);
        }
        return out;
    }, [isDaily, pointOnlyActive, r.points, dateRanges, groupExpr, feedQ.data, groupsView, pointsByChart]);

    // 차트 단위 선(일봉) — 분봉 뷰에선 비어 있다(선의 모집단이 다르다).
    const shapes = useMemo<ChartSkeleton[]>(() => {
        const feed = feedQ.data;
        if (!feed || !isDaily) return [];
        const out: ChartSkeleton[] = [];
        for (const e of feed.daily) {
            const key = chartKey(e);
            if (chartAllowed && !chartAllowed.has(key)) continue;
            const n = normalizeSkeleton(e.pivots, anchor, { key, stockCode: e.stockCode, date: e.date });
            if (n) out.push(n);
        }
        return out;
    }, [feedQ.data, chartAllowed, isDaily, anchor]);

    // 타점 단위 선(분봉) — 골격 하나를 타점마다 %p 공간으로 재정규화. 필터는 타점 알갱이(matchedPks)로 직접.
    // 결손(전일 종가 미수집 → %p 분모 없음)은 **세어서 따로 낸다** — 조용히 빼면 "N개 / M"의 차이가
    // 전부 필터 탓으로 보인다(결손은 수집으로 고칠 일이지 필터를 의심할 일이 아니다).
    const [pointLines, missingPrevClose] = useMemo<[OverlayLine[], number]>(() => {
        const feed = feedQ.data;
        if (!feed || isDaily) return [[], 0];
        const out: OverlayLine[] = [];
        let missing = 0;
        for (const e of feed.minute) {
            const key = chartKey(e);
            if (onlyCharts && !onlyCharts.has(key)) continue;
            const pts = (pointsByChart.get(key) ?? [])
                .map((rp) => ({ pk: pointKey(rp), time: rp.time }))
                .filter((p) => !matchedPks || matchedPks.has(p.pk));
            if (pts.length === 0) continue;
            if (e.prevClose == null || e.prevClose <= 0) { missing++; continue; }
            out.push(...pointSkeletons(e.pivots, e.prevClose, pts, { key, stockCode: e.stockCode, date: e.date }));
        }
        return [out, missing];
    }, [feedQ.data, isDaily, onlyCharts, pointsByChart, matchedPks]);

    const lines: OverlayLine[] = isDaily ? shapes : pointLines;

    // 선은 언제나 차트 소유 — 모든 뷰가 같은 목록을 본다(타점 단위 선은 chartKey 로 찾는다).
    const levelsByChart = useMemo(() => {
        const m = new Map<string, SkeletonWireLevel[]>();
        for (const l of feedQ.data?.levels ?? []) m.set(chartKey(l), l.levels);
        return m;
    }, [feedQ.data]);

    // 모집단 — 일봉은 차트 수, 분봉은 분봉 골격 차트 위의 타점 수(필터 전).
    const population = useMemo(() => {
        const feed = feedQ.data;
        if (!feed) return 0;
        if (isDaily) return feed.daily.length;
        return feed.minute.reduce((n, e) => n + (pointsByChart.get(chartKey(e))?.length ?? 0), 0);
    }, [feedQ.data, isDaily, pointsByChart]);

    return { feedLoading: feedQ.isLoading, lines, population, missingPrevClose, levelsByChart, pointsByChart, nameOf };
}
