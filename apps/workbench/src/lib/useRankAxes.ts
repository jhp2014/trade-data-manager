// 축 목록 + 축별 배치줄 — 배치 보드·시트·분석·작업셋·차트가 공유하는 한 벌.
// 세 곳이 각자 rankAxesQuery + 축별 페치 + 사용자 순서 정렬을 재현하고 있었고,
// 정렬·재정렬 코드는 배치와 시트에서 변수명까지 같았다(양방향 동기화라 어긋나면 바로 티가 난다).
// 파생 모양은 소비자마다 다르므로(Slot 묶음 / 순위 인덱스 / raw) **raw 라인까지만** 여기서 준다.
// 줄은 전축 한 방(axisLinesQuery) — 축 수만큼 왕복하던 N+1 을 없앴다. 배치 0인 축은 응답에 없으므로 빈 배열로 채운다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import { axisLinesQuery, computedAxesQuery, rankAxesQuery } from "../api/queries.js";
import { computedAxisView } from "./computedAxis.js";
import { useWorkbench } from "../store/workbench.js";

export interface RankAxesView {
    /** 사용자 순서(store rankAxisOrder) 적용. pref 에 없는 새 축은 뒤로, 동률은 id 안정 정렬. */
    axes: RankAxis[];
    axisIds: string[];
    /** axisId → 그 축의 배치줄(orderKey 오름차). 모든 축이 키를 가짐(미배치 축 = 빈 배열). */
    linesByAxis: Map<string, PlacedPoint[]>;
    /** 계산 축만: axisId → (타점키 → 원시 수치). 값 구간 필터·레일 라벨이 쓴다. 판단 축은 키가 없다. */
    computedValues: Map<string, Map<string, number>>;
    /** 계산 축만: axisId → 강한 방향. 레일 좌표 매핑에 필요. */
    computedMeta: Map<string, { strongerWhen: "higher" | "lower" }>;
    isLoading: boolean;
    /** dragged 축을 target 축 자리로 옮긴다(양 패널 공유 — 한쪽에서 바꾸면 다른 쪽도 따라온다). */
    reorder: (draggedId: string, targetId: string) => void;
}

export interface UseRankAxesOptions {
    /**
     * 계산 축(수식으로 나오는 축)을 함께 볼지. **기본 false.**
     * 계산 축은 드래그로 꽂는 대상이 아니고(값이 자리를 정한다), 밴드·컷은 slotId 를 영속 키로 쓰는데 그 id 가
     * 값에서 파생돼 재계산 시 바뀐다. 그래서 배치 보드·필터는 판단 축만 보고, 시트만 켠다(읽기 표시).
     */
    includeComputed?: boolean;
}

export function useRankAxes({ includeComputed = false }: UseRankAxesOptions = {}): RankAxesView {
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);

    const axesQ = useQuery(rankAxesQuery());
    // 계산 축 — 안 켠 화면에서는 요청조차 안 나간다(enabled). 훅 순서는 유지.
    const computedQ = useQuery({ ...computedAxesQuery(), enabled: includeComputed });
    const computed = useMemo(
        () => (includeComputed ? (computedQ.data ?? []).map(computedAxisView) : []),
        [includeComputed, computedQ.data],
    );

    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);
    const axes = useMemo(() => {
        const idx = new Map(orderPref.map((id, i) => [id, i]));
        const all = [...rawAxes, ...computed.map((c) => c.axis)];
        return all.sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : 1));
    }, [rawAxes, computed, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.id), [axes]);

    const linesQ = useQuery(axisLinesQuery());
    const linesByAxis = useMemo(() => {
        const feed = new Map((linesQ.data ?? []).map((l) => [l.axisId, l.placements]));
        for (const c of computed) feed.set(c.axis.id, c.line);
        return new Map(axes.map((a) => [a.id, feed.get(a.id) ?? []]));
    }, [axes, linesQ.data, computed]);

    const reorder = (draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.id);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRankAxisOrder(ids);
    };

    const computedValues = useMemo(() => new Map(computed.map((c) => [c.axis.id, c.values])), [computed]);
    const computedMeta = useMemo(() => new Map(computed.map((c) => [c.axis.id, { strongerWhen: c.strongerWhen }])), [computed]);

    return {
        axes, axisIds, linesByAxis, computedValues, computedMeta,
        isLoading: axesQ.isLoading || linesQ.isLoading || (includeComputed && computedQ.isLoading),
        reorder,
    };
}
