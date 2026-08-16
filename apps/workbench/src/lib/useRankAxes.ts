// 축 목록 + 축별 배치줄 — 배치 보드·시트·분석·작업셋·차트가 공유하는 한 벌.
// 세 곳이 각자 rankAxesQuery + 축별 페치 + 사용자 순서 정렬을 재현하고 있었고,
// 정렬·재정렬 코드는 배치와 시트에서 변수명까지 같았다(양방향 동기화라 어긋나면 바로 티가 난다).
// 파생 모양은 소비자마다 다르므로(Slot 묶음 / 순위 인덱스 / raw) **raw 라인까지만** 여기서 준다.
// 줄은 전축 한 방(axisLinesQuery) — 축 수만큼 왕복하던 N+1 을 없앴다. 배치 0인 축은 응답에 없으므로 빈 배열로 채운다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlacedPoint } from "@trade-data-manager/wire";
import { axisLinesQuery, computedAxesQuery, rankAxesQuery } from "../api/queries.js";
import { computedAxisView, placedAxisKey, type AxisRef } from "./computedAxis.js";
import { useWorkbench } from "../store/workbench.js";

/** 계산 축의 화면용 메타 — 값 자체가 아니라 값을 어떻게 놓고 어떻게 읽는지. */
export interface ComputedAxisMeta {
    strongerWhen: "higher" | "lower";
    /** 값 → 라벨. 단위가 축마다 다르다(%·일…) — 축 정의가 규격을 주고 여기선 함수로만 다닌다. */
    fmt: (v: number) => string;
}

export interface RankAxesView {
    /** 사용자 순서(store rankAxisOrder) 적용. pref 에 없는 새 축은 뒤로, 동률은 키 안정 정렬. */
    axes: AxisRef[];
    axisIds: string[];
    /** 축 키 → 그 축의 배치줄(orderKey 오름차). 모든 축이 키를 가짐(미배치 축 = 빈 배열). */
    linesByAxis: Map<string, PlacedPoint[]>;
    /** 계산 축만: 축 키 → (타점키 → 원시 수치). 값 구간 필터·레일 라벨이 쓴다. 판단 축은 키가 없다. */
    computedValues: Map<string, Map<string, number>>;
    /** 계산 축만: 축 키 → 강한 방향(레일 좌표 매핑) + 값 표시 함수(단위가 축마다 다르다 — %·일…). */
    computedMeta: Map<string, ComputedAxisMeta>;
    isLoading: boolean;
    /** dragged 축을 target 축 자리로 옮긴다(양 패널 공유 — 한쪽에서 바꾸면 다른 쪽도 따라온다). */
    reorder: (draggedId: string, targetId: string) => void;
}

/**
 * ⚠ **직접 부르지 말 것** — RankAxesProvider 가 유일한 호출자다(소비는 RankAxesContext 의 useRankAxes).
 * 인스턴스마다 계산 축의 `타점키 → 수치` 맵을 축별로 새로 만드는데, 타점이 수천이면 그 비용이
 * 부르는 화면 수만큼 그대로 는다.
 *
 * 옛 `includeComputed` 옵션은 없앴다. 켜는 곳과 끄는 곳이 갈려 있으면 "이 화면의 axes 에 계산 축이
 * 들어 있나"가 부르는 자리마다 달라지는데, 실제로는 **부르는 세 곳이 전부 켜고 있었다**. 한 벌이 된
 * 지금은 답이 하나여야 한다(그리고 그 요청은 어차피 앱 수명 동안 한 번이다).
 */
export function useRankAxesValue(): RankAxesView {
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);

    const axesQ = useQuery(rankAxesQuery());
    const computedQ = useQuery(computedAxesQuery());
    const computed = useMemo(() => (computedQ.data ?? []).map(computedAxisView), [computedQ.data]);

    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);
    const axes = useMemo<AxisRef[]>(() => {
        const idx = new Map(orderPref.map((k, i) => [k, i]));
        const all: AxisRef[] = [...rawAxes.map((a) => ({ ...a, key: placedAxisKey(a.name) })), ...computed.map((c) => c.axis)];
        return all.sort((a, b) => (idx.get(a.key) ?? Infinity) - (idx.get(b.key) ?? Infinity) || (a.key < b.key ? -1 : 1));
    }, [rawAxes, computed, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.key), [axes]);

    const linesQ = useQuery(axisLinesQuery());
    const linesByAxis = useMemo(() => {
        const feed = new Map((linesQ.data ?? []).map((l) => [placedAxisKey(l.axisName), l.placements]));
        for (const c of computed) feed.set(c.axis.key, c.line);
        return new Map(axes.map((a) => [a.key, feed.get(a.key) ?? []]));
    }, [axes, linesQ.data, computed]);

    const reorder = (draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.key);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRankAxisOrder(ids);
    };

    const computedValues = useMemo(() => new Map(computed.map((c) => [c.axis.key, c.values])), [computed]);
    const computedMeta = useMemo(() => new Map(computed.map((c) => [c.axis.key, { strongerWhen: c.strongerWhen, fmt: c.fmt }])), [computed]);

    return {
        axes, axisIds, linesByAxis, computedValues, computedMeta,
        isLoading: axesQ.isLoading || linesQ.isLoading || computedQ.isLoading,
        reorder,
    };
}
