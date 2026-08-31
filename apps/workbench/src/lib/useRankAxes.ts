// 축 목록 + 축별 줄 — 시트·필터·작업셋·차트가 공유하는 한 벌. 축은 전부 **계산 축**이다
// (판단축은 2026-08-25 폐지 — 값은 서버 피드, 줄(orderKey)은 여기서 값으로 조립한다: computedAxisView).
// 파생 모양은 소비자마다 다르므로(순위 인덱스 / raw) **raw 라인까지만** 여기서 준다.
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlacedPoint } from "@trade-data-manager/wire";
import { computedAxesQuery } from "../api/queries.js";
import { computedAxisView, type AxisRef } from "./computedAxis.js";
import { gridFeatureFeeds } from "./gridFeatures.js";
import { useAutoPoints, usePointGrids } from "./PointGridsContext.js";
import { useWorkbench } from "../store/workbench.js";

/** 계산 축의 화면용 메타 — 값 자체가 아니라 값을 어떻게 놓고 어떻게 읽는지. */
export interface ComputedAxisMeta {
    strongerWhen: "higher" | "lower";
    /** 값 → 라벨. 단위가 축마다 다르다(%·일…) — 축 정의가 규격을 주고 여기선 함수로만 다닌다. */
    fmt: (v: number) => string;
}

export interface RankAxesView {
    /**
     * 시트 축 서열(store rankAxisOrder) 적용. pref 에 없는 새 축은 뒤로, 동률은 키 안정 정렬.
     * ⚠ 집합 편성 보드는 이 순서 **위에** 제 순서를 한 겹 더 입힌다(패널 로컬 — panels/filter/axisOrder.ts).
     */
    axes: AxisRef[];
    axisIds: string[];
    /** 축 키 → 그 축의 줄(orderKey 오름차). 모든 축이 키를 가짐(값 없는 축 = 빈 배열). */
    linesByAxis: Map<string, PlacedPoint[]>;
    /** 축 키 → (타점키 → 원시 수치). 값 구간 필터·레일 라벨이 쓴다. */
    computedValues: Map<string, Map<string, number>>;
    /** 축 키 → 강한 방향(레일 좌표 매핑) + 값 표시 함수(단위가 축마다 다르다 — %·일…). */
    computedMeta: Map<string, ComputedAxisMeta>;
    isLoading: boolean;
    /** dragged 축을 target 축 자리로 옮긴다 — **시트 서열**을 만진다(집합 편성 보드는 제 순서를 따로 든다). */
    reorder: (draggedId: string, targetId: string) => void;
}

/**
 * ⚠ **직접 부르지 말 것** — RankAxesProvider 가 유일한 호출자다(소비는 RankAxesContext 의 useRankAxes).
 * 인스턴스마다 계산 축의 `타점키 → 수치` 맵을 축별로 새로 만드는데, 타점이 수천이면 그 비용이
 * 부르는 화면 수만큼 그대로 는다.
 */
export function useRankAxesValue(): RankAxesView {
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);

    const computedQ = useQuery(computedAxesQuery());
    // 격자 특징(클라 파생) — 서버 피드 뒤에 같은 모양으로 이어 붙인다(축 종류를 하류가 구분하지 않게).
    // 키 접두 `grid-` 는 서버 레지스트리가 안 쓰는 예약 — gridFeatures.ts 머리 주석이 계약이다.
    // **모수가 있을 때만 선다**: 출처가 손 타점이거나 자동 Point 0 이면 값이 전부 결손이라 "값 없음"
    // 레일 3개가 상시 소음이 된다 — 축 자체를 안 만든다(새 축 기본 "보임" 규칙과 충돌하지 않게).
    const autoView = useAutoPoints();
    const gridsView = usePointGrids();
    const pointSource = useWorkbench((s) => s.pointSource);
    const computed = useMemo(() => {
        const synth = pointSource === "auto" && autoView.points.length > 0 ? gridFeatureFeeds(autoView, gridsView.gridOf) : [];
        return [...(computedQ.data ?? []), ...synth].map(computedAxisView);
    }, [computedQ.data, autoView, gridsView, pointSource]);

    const axes = useMemo<AxisRef[]>(() => {
        const idx = new Map(orderPref.map((k, i) => [k, i]));
        return computed
            .map((c) => c.axis)
            .sort((a, b) => (idx.get(a.key) ?? Infinity) - (idx.get(b.key) ?? Infinity) || (a.key < b.key ? -1 : 1));
    }, [computed, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.key), [axes]);

    const linesByAxis = useMemo(() => {
        const feed = new Map(computed.map((c) => [c.axis.key, c.line]));
        return new Map(axes.map((a) => [a.key, feed.get(a.key) ?? []]));
    }, [axes, computed]);

    const reorder = useCallback((draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.key);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRankAxisOrder(ids);
    }, [axes, setRankAxisOrder]);

    const computedValues = useMemo(() => new Map(computed.map((c) => [c.axis.key, c.values])), [computed]);
    const computedMeta = useMemo(() => new Map(computed.map((c) => [c.axis.key, { strongerWhen: c.strongerWhen, fmt: c.fmt }])), [computed]);

    const isLoading = computedQ.isLoading;
    // 반환 객체도 참조를 고정한다(useGroups 와 같은 이유) — Provider 가 이걸 context value 로 그대로 넘기므로,
    // 매 렌더 새 객체면 셸이 렌더될 때마다 **구독자 전원**이 따라 렌더된다.
    return useMemo(
        () => ({ axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading, reorder }),
        [axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading, reorder],
    );
}
