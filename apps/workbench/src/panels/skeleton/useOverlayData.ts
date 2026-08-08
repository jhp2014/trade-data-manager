// 골격 겹쳐 그리기의 **데이터 조립 + 필터 판정** — 패널의 읽기 절반.
// 렌더(SVG·라벨·손잡이)와 갈라둔 이유: 여기의 판정 규칙(분봉 필터 확정 규칙·일봉 차트 단위 우회)은
// 사용자 확정 규약이라 바뀔 때마다 정확히 읽혀야 하는데, 900줄 렌더 컴포넌트 안에서는 그게 안 됐다.
// 렌더 상태(선택·호버·확대)는 여기 없다 — 입력은 뷰 모드와 "선택만 보기" 집합뿐이다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { skeletonsQuery, anchoredChartsQuery, allPointsQuery } from "../../api/queries.js";
import { useRankFilterResult } from "../rank/useRankFilterResult.js";
import { evalTagExpr, isTagExprEmpty } from "../rank/tagFilter.js";
import { useWorkbench } from "../../store/workbench.js";
import { pointKey, chartKey, type PointRef } from "../../lib/pointKey.js";
import {
    normalizeSkeleton, absoluteSkeleton, pointSkeletons, minutesOf,
    type ChartSkeleton, type OverlayLine, type SkeletonAnchor,
} from "./skeletonOverlay.js";
import type { TagsView } from "../../lib/useTags.js";
import type { SkeletonWireLevel } from "../../api/skeletons.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";

/** 패널의 뷰 모드 — 셋이 서로 배타(일봉 / 분봉 절대 / 분봉 타점 정규화). */
export interface OverlayView {
    isDaily: boolean;
    isAbs: boolean;
    isPointUnit: boolean;
}

/** 절대 뷰의 타점 마커 — 경로 위 타점 자리(값 공간 좌표). 손잡이(칩·세로선·마퀴 판정)의 재료. */
export interface OverlayMarker {
    pk: string;
    ref: PointRef;
    s: ChartSkeleton;
    x: number;
    y: number;
}

export interface OverlayData {
    feedLoading: boolean;
    /** 화면의 선들 — 뷰 모드에 따라 차트 단위 또는 타점 단위(kind 로 갈린다). */
    lines: OverlayLine[];
    /** 절대 뷰의 타점 마커(다른 뷰에선 빈 배열). */
    markers: OverlayMarker[];
    markerByPk: Map<string, OverlayMarker>;
    /** 필터 전 모집단 수 — 헤더의 "N개 / M" 분모. */
    population: number;
    levelsByChart: Map<string, SkeletonWireLevel[]>;
    /** 차트키 → 그 차트의 저장 타점들(시간 오름차순). 필터와 무관한 전체(선은 사실을 그린다). */
    pointsByChart: Map<string, ReviewPointListItem[]>;
    nameOf: (code: string) => string;
}

export function useOverlayData(
    view: OverlayView,
    anchor: SkeletonAnchor,
    /** "선택만 보기" — null 이면 제한 없음. 렌더 쪽 선택 상태에서 내려온다. */
    onlyCharts: ReadonlySet<string> | null,
    /** 태그 뷰 — 패널과 같은 인스턴스를 받는다(두 번 만들면 인덱스 memo 가 두 벌 돈다). */
    tagsView: TagsView,
): OverlayData {
    const { isDaily, isAbs, isPointUnit } = view;
    const feedQ = useQuery(skeletonsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const r = useRankFilterResult();

    // 분봉 필터 확정 규칙(사용자 확정 — 후자): 필터는 **타점 알갱이**로 작동한다. 정규화(타점 단위) 뷰는
    // 매칭 타점만, 절대 뷰는 매칭 타점이 하나도 없는 차트를 선째 제외하고 남는 차트도 걸러진 마커는 뺀다.
    // "매칭 타점을 가진 차트" 식의 차트 단위 우회는 일봉 패널 전용으로 남는다.
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
    //  · 날짜·태그 = 차트에서도 판정 가능 → 차트 자체로 평가한다. 태그는 **차트 직접 부착 ∪ 그 타점들의
    //    태그**(상속 포함)라 어느 쪽에 붙었든 잡힌다. 이 경로가 타점 경로의 상위집합이라 합집합이 필요 없다.
    // 분봉 패널은 이 우회를 안 탄다(사용자 확정) — 절대 뷰는 매칭 타점의 차트만, 정규화 뷰는 선=타점이라
    // matchedPks 가 직접 거른다(아래 pointLines).
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const tagExpr = useWorkbench((s) => s.tagExpr);
    const pointOnlyActive = r.pointOnlyActive;

    const chartAllowed = useMemo<ReadonlySet<string> | null>(() => {
        if (!isDaily) {
            if (!filterActive) return null;
            return new Set(r.points.map((p) => chartKey(p))); // 매칭 타점 없는 차트는 선째 제외
        }
        if (pointOnlyActive) return new Set(r.points.map((p) => chartKey(p)));
        const dateActive = dateRanges.length > 0;
        const tagActive = !isTagExprEmpty(tagExpr);
        if (!dateActive && !tagActive) return null; // 무필터 = 전 차트
        const feed = feedQ.data;
        if (!feed) return new Set();
        const out = new Set<string>();
        for (const e of feed.daily) {
            const key = chartKey(e);
            if (dateActive && !dateRanges.some((rg) => e.date >= rg.from && e.date <= rg.to)) continue;
            if (tagActive) {
                const ids = new Set(tagsView.chartTagIdsOf(e));
                for (const p of pointsByChart.get(key) ?? []) for (const id of tagsView.tagIdsOf(p)) ids.add(id);
                if (!evalTagExpr([...ids], tagExpr)) continue;
            }
            out.add(key);
        }
        return out;
    }, [isDaily, filterActive, pointOnlyActive, r.points, dateRanges, tagExpr, feedQ.data, tagsView, pointsByChart]);

    // 차트 단위 선(일봉·분봉 절대) — 타점 단위 뷰에선 비어 있다(선의 모집단이 다르다).
    const shapes = useMemo<ChartSkeleton[]>(() => {
        const feed = feedQ.data;
        if (!feed || isPointUnit) return [];
        const out: ChartSkeleton[] = [];
        for (const e of isDaily ? feed.daily : feed.minute) {
            const key = chartKey(e);
            if (chartAllowed && !chartAllowed.has(key)) continue;
            if (onlyCharts && !onlyCharts.has(key)) continue;
            const owner = { key, stockCode: e.stockCode, date: e.date };
            const n = isAbs ? absoluteSkeleton(e.pivots, e.prevClose, owner) : normalizeSkeleton(e.pivots, anchor, owner);
            if (n) out.push(n);
        }
        return out;
    }, [feedQ.data, chartAllowed, onlyCharts, isDaily, isAbs, isPointUnit, anchor]);

    // 타점 단위 선(분봉 정규화) — 골격 하나를 타점마다 재정규화. 필터는 타점 알갱이(matchedPks)로 직접.
    const pointLines = useMemo<OverlayLine[]>(() => {
        const feed = feedQ.data;
        if (!feed || !isPointUnit) return [];
        const out: OverlayLine[] = [];
        for (const e of feed.minute) {
            const key = chartKey(e);
            if (onlyCharts && !onlyCharts.has(key)) continue;
            const pts = (pointsByChart.get(key) ?? [])
                .map((rp) => ({ pk: pointKey(rp), time: rp.time }))
                .filter((p) => !matchedPks || matchedPks.has(p.pk));
            if (pts.length > 0) out.push(...pointSkeletons(e.pivots, pts, { key, stockCode: e.stockCode, date: e.date }));
        }
        return out;
    }, [feedQ.data, isPointUnit, onlyCharts, pointsByChart, matchedPks]);

    const lines: OverlayLine[] = isPointUnit ? pointLines : shapes;

    // 선은 언제나 차트 소유 — 모든 뷰가 같은 목록을 본다(타점 단위 선은 chartKey 로 찾는다).
    const levelsByChart = useMemo(() => {
        const m = new Map<string, SkeletonWireLevel[]>();
        for (const l of feedQ.data?.levels ?? []) m.set(chartKey(l), l.levels);
        return m;
    }, [feedQ.data]);

    // 모집단 — 차트 단위 뷰는 차트 수, 타점 단위 뷰는 분봉 골격 차트 위의 타점 수(필터 전).
    const population = useMemo(() => {
        const feed = feedQ.data;
        if (!feed) return 0;
        if (isDaily) return feed.daily.length;
        if (!isPointUnit) return feed.minute.length;
        return feed.minute.reduce((n, e) => n + (pointsByChart.get(chartKey(e))?.length ?? 0), 0);
    }, [feedQ.data, isDaily, isPointUnit, pointsByChart]);

    // ── 타점 마커(분봉 **절대 뷰** 전용 — 정규화 뷰는 선 자체가 타점이라 마커가 없다).
    // 타점이 경로 어디에 서 있나 + 타점 단위 손잡이(이동·선택·태그)의 재료. y 는 그 시각의 경로 피벗에서 찾는다:
    // 유효한 분봉 골격은 모든 타점 시각에 피벗을 갖는다(합성 규칙 — 손 피벗이 있으면 그것, 없으면 합성 종가).
    // 필터가 활성이면 걸러진 타점의 마커는 뺀다(확정 규칙 — 남은 차트라도 매칭 타점만 손잡이를 받는다).
    const markers = useMemo<OverlayMarker[]>(() => {
        if (!isAbs) return [];
        const out: OverlayMarker[] = [];
        for (const s of shapes) {
            for (const rp of pointsByChart.get(s.chartKey) ?? []) {
                const pk = pointKey(rp);
                if (matchedPks && !matchedPks.has(pk)) continue;
                const px = minutesOf(rp.time) - s.baseT;
                const at = s.points.find((q) => q.x === px);
                if (at) out.push({ pk, ref: rp, s, x: px, y: at.y });
            }
        }
        return out;
    }, [isAbs, shapes, pointsByChart, matchedPks]);
    const markerByPk = useMemo(() => new Map(markers.map((m) => [m.pk, m])), [markers]);

    return { feedLoading: feedQ.isLoading, lines, markers, markerByPk, population, levelsByChart, pointsByChart, nameOf };
}
