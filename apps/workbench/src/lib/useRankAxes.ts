// 축 목록 + 축별 배치줄 — 배치 보드·시트·분석·작업셋·차트가 공유하는 한 벌.
// 세 곳이 각자 rankAxesQuery + 축별 페치 + 사용자 순서 정렬을 재현하고 있었고,
// 정렬·재정렬 코드는 배치와 시트에서 변수명까지 같았다(양방향 동기화라 어긋나면 바로 티가 난다).
// 파생 모양은 소비자마다 다르므로(Slot 묶음 / 순위 인덱스 / raw) **raw 라인까지만** 여기서 준다.
// 줄은 전축 한 방(axisLinesQuery) — 축 수만큼 왕복하던 N+1 을 없앴다. 배치 0인 축은 응답에 없으므로 빈 배열로 채운다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import { axisLinesQuery, rankAxesQuery } from "../api/queries.js";
import { useWorkbench } from "../store/workbench.js";

export interface RankAxesView {
    /** 사용자 순서(store rankAxisOrder) 적용. pref 에 없는 새 축은 뒤로, 동률은 id 안정 정렬. */
    axes: RankAxis[];
    axisIds: string[];
    /** axisId → 그 축의 배치줄(orderKey 오름차). 모든 축이 키를 가짐(미배치 축 = 빈 배열). */
    linesByAxis: Map<string, PlacedPoint[]>;
    isLoading: boolean;
    /** dragged 축을 target 축 자리로 옮긴다(양 패널 공유 — 한쪽에서 바꾸면 다른 쪽도 따라온다). */
    reorder: (draggedId: string, targetId: string) => void;
}

export function useRankAxes(): RankAxesView {
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);

    const axesQ = useQuery(rankAxesQuery());
    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);
    const axes = useMemo(() => {
        const idx = new Map(orderPref.map((id, i) => [id, i]));
        return [...rawAxes].sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : 1));
    }, [rawAxes, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.id), [axes]);

    const linesQ = useQuery(axisLinesQuery());
    const linesByAxis = useMemo(() => {
        const feed = new Map((linesQ.data ?? []).map((l) => [l.axisId, l.placements]));
        return new Map(axes.map((a) => [a.id, feed.get(a.id) ?? []]));
    }, [axes, linesQ.data]);

    const reorder = (draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.id);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRankAxisOrder(ids);
    };

    return { axes, axisIds, linesByAxis, isLoading: axesQ.isLoading || linesQ.isLoading, reorder };
}
