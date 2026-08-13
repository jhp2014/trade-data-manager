// 골격 겹쳐 그리기의 **데이터 조립** — 패널의 읽기 절반. 렌더(SVG·라벨·손잡이)와 갈라둔 이유:
// 조립 규칙은 사용자 확정 규약이라 바뀔 때마다 정확히 읽혀야 하는데, 900줄 렌더 컴포넌트 안에서는 안 됐다.
//
// 필터는 **깔때기의 보는 집합을 구독만 한다** — 조건 평가는 깔때기가 끝냈고, 여기는 그 결과 집합에
// 드는 차트/타점만 남긴다. 알갱이 규칙이 두 뷰를 정리한다:
//   · 일봉(차트 단위) = 보는 집합의 차트 열쇠(타점 항목은 제 차트로 접힌다 — 위로 접기는 집합 소속이라 안전)
//   · 분봉(타점 단위) = 보는 집합을 타점으로 펼친 것(하루 항목은 그날 전 타점 — 정직한 반복)
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { skeletonsQuery, anchoredChartsQuery, allPointsQuery } from "../../api/queries.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { pointKey, chartKey } from "../../lib/pointKey.js";
import {
    normalizeSkeleton, pointSkeletons,
    type ChartSkeleton, type OverlayLine, type SkeletonAnchor,
} from "./skeletonOverlay.js";
import type { SkeletonWireLevel } from "../../api/skeletons.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";

export interface OverlayData {
    feedLoading: boolean;
    /** 화면의 선들 — 일봉은 차트 단위, 분봉은 타점 단위(kind 로 갈린다). */
    lines: OverlayLine[];
    /** 필터 전 모집단 수 — 헤더의 "N개 / M" 분모. */
    population: number;
    /**
     * 분봉에서 전일 종가(%p 분모) 미수집으로 **못 그린 타점 수** — 필터로 빠진 것과 구분해 보여야 한다.
     * ⚠ 단위는 **타점**이다(차트가 아니라). 화면이 이걸 `population`·`lines.length` 와 나란히 세워
     * "M − N = 필터 + 결손"으로 읽히게 하는데, 셋 중 하나만 차트를 세면 그 산수가 조용히 깨진다.
     */
    missingPrevClose: number;
    levelsByChart: Map<string, SkeletonWireLevel[]>;
    /** 차트키 → 그 차트의 저장 타점들(시간 오름차순). 필터와 무관한 전체(선은 사실을 그린다). */
    pointsByChart: Map<string, ReviewPointListItem[]>;
    nameOf: (code: string) => string;
}

export function useOverlayData(
    isDaily: boolean,
    anchor: SkeletonAnchor,
    /** "선택만 보기" — null 이면 제한 없음. 렌더 쪽 선택 상태에서 내려온다(패널 로컬 시야 — 필터와 별개). */
    onlyCharts: ReadonlySet<string> | null,
): OverlayData {
    const feedQ = useQuery(skeletonsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const funnel = useFunnel();

    // 깔때기 구독 — 안 걸려 있으면 null(제한 없음). 로딩 중에도 null: 판정이 안 끝난 집합으로 거르면
    // 빈 화면이 "조건에 다 걸렸다"로 읽힌다.
    const filterOn = !funnel.isLoading && funnel.isFiltering;
    const chartAllowed = useMemo<ReadonlySet<string> | null>(
        () => (isDaily && filterOn ? funnel.viewedChartKeys : null),
        [isDaily, filterOn, funnel.viewedChartKeys],
    );
    const matchedPks = useMemo<ReadonlySet<string> | null>(
        () => (!isDaily && filterOn ? new Set(funnel.viewedPointRefs.map((p) => pointKey(p))) : null),
        [isDaily, filterOn, funnel.viewedPointRefs],
    );

    // 종목명 — 타점 없는 차트는 타점 피드에서 이름이 안 나온다. 앵커 걸린 차트 피드가 이름을 달고
    // 오니(서버 MasterCache.attachNames) 그걸 먼저 보고, 없으면 타점 피드.
    const chartsQ = useQuery(anchoredChartsQuery());
    const nameOf = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        for (const c of chartsQ.data ?? []) if (c.name) m.set(c.stockCode, c.name);
        return (code: string): string => m.get(code) ?? code;
    }, [chartsQ.data, pointsQ.data]);

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
    //
    // ⚠ 세는 단위는 **타점**이다. 이 뷰의 선도 모집단도 타점이라 차트를 세면 그 표기만 단위가 달라져
    // "M − N = 필터 + 결손"이 안 맞는다(차트 3개가 빠졌는데 타점은 10개 사라지는 식).
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
            if (e.prevClose == null || e.prevClose <= 0) { missing += pts.length; continue; }
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
