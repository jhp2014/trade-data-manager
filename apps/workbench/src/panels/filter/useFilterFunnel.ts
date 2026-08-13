// 깔때기 배선 — 조각 넷을 실제 데이터로 잇는 단 하나의 자리.
//   유니버스(후보 하루) → 표시 알갱이로 펼치기 → 단계별 3치 판정 → 정산(5칸·한계 기여도)
//
// 순수 조각들(stage·evaluate·core/funnel)은 이 훅 없이도 테스트되고, 여기서는 **재료를 꽂는 일만** 한다.
// 그래서 저장 방식이 바뀌면 이 파일만 바뀐다.
//
// ⚠ **사전이 오기 전에는 아무것도 정하지 않는다.** 알갱이 판정이 사전을 보는데, 로딩 중의 "모름"은
// "없음"이 아니라 "곧 옴"이다. 그때 해상도를 확정하면 사전이 도착하는 순간 화면이 통째로 다시 그려지고,
// 더 나쁘게는 그 사이의 5칸 숫자가 전부 미배치로 부풀어 사용자가 그걸 사실로 읽는다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    blockedBy, expandUniverse, tallyFunnel, type FunnelItem, type FunnelResult,
} from "@trade-data-manager/market/domain";
import { allPointsQuery, candidateDaysQuery } from "../../api/queries.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useRankAxes, type RankAxesView } from "../../lib/RankAxesContext.js";
import { chartKey, pointKey } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { buildAxisOrderIndexes, dayAxisValueOf } from "./axisLookup.js";
import { resolveBound, toFunnelStages, type EvalLookup } from "./evaluate.js";
import { stageLabel, type LabelLookup } from "./label.js";
import {
    activeStages, canExpand, displayGrain, funnelOrder, isPredicateDead, resolveAutoGrain,
    type FilterStage, type Grain, type GrainLookup, type OrderedStage,
} from "./stage.js";

export interface FunnelView {
    /** 사전(그룹·축·후보·타점)이 다 오기 전 — 이때 숫자를 읽으면 안 된다. */
    isLoading: boolean;
    /** 표시 해상도. 자동(걸린 단계 중 가장 가는 것) + 손으로 아래로만. */
    grain: Grain;
    /** 손으로 타점까지 펼칠 수 있나(자동이 이미 타점이면 더 내려갈 데가 없다). */
    canExpandToPoints: boolean;
    /** 분모. **편집에 따라 조용히 변하므로 화면에 상시 띄운다**(앵커 하나 지우면 그 하루가 빠진다). */
    universe: number;
    /** 전 단계(빈 것·꺼진 것 포함) — 하루가 먼저, 층위 접힘 포함. 화면의 칸 나누기가 이걸 그대로 쓴다. */
    stagesOrdered: OrderedStage[];
    /** 평가에 실제로 들어간 단계 — stagesOrdered 에서 활성만 남긴 것(정산 인덱스와 1:1). */
    active: FilterStage[];
    /**
     * 지금 보는 집합 — 짚은 칸들의 합집합, 안 짚었으면 최종 생존. **모든 구독 패널이 이걸 본다** —
     * 조건을 나눠 주면 패널마다 판정을 재구현해 서로 다른 답을 낸다(필터 UI 가 두 곳이던 문제와 같은 종류).
     */
    viewedItems: FunnelItem[];
    /** 단계나 시선이 하나라도 걸려 있나 — false 면 구독자는 거르지 않는다(전체 = 제한 없음). */
    isFiltering: boolean;
    /** 보는 집합의 차트 열쇠(종목|날짜) — 차트 단위 구독자(골격 일봉)용. 타점 항목은 제 차트로 접힌다. */
    viewedChartKeys: Set<string>;
    /**
     * 보는 집합을 **타점으로 펼친 것** — 타점 단위 구독자(시트·분석·골격 분봉)용.
     * 하루 항목은 그날 타점 전부로(하루 조건은 전 타점에 같은 값 — 정직한 반복), 타점 없는 하루는 0개로.
     */
    viewedPointRefs: { stockCode: string; date: string; time: string }[];
    /** 정산 결과. 로딩 중이면 null. */
    result: FunnelResult | null;
    /** 죽은 참조(지워진 그룹·축)를 든 단계 id — 화면이 표시하고, 정리는 사용자가 결정한다. */
    deadStageIds: string[];
    /** 이름 조회 — 깔때기가 이미 사전을 들고 있으니 라벨을 만드는 자리마다 다시 조립하지 않게. */
    labelLook: LabelLookup;
    /**
     * 축 재료 한 벌(목록·배치줄·계산 값). 필터 보드의 레일이 이걸로 그린다.
     * (계산 축 값 맵이 여러 벌 만들어지던 문제는 이제 RankAxesProvider 가 막는다 — 여기 실어 나르는 건
     *  그 방어가 아니라 편의다: 깔때기를 구독하는 화면은 축도 같이 필요하다.)
     */
    axes: RankAxesView;
    /** 이 항목을 앞선 어느 단계가 막았나(근접 탈락 목록의 "막힌 단계"). 단계 이름으로 돌려준다. */
    blockedLabels: (item: FunnelItem, stageIndex: number) => string[];
}

/** ⚠ 직접 부르지 말 것 — FunnelProvider 가 유일한 호출자다(소비는 useFunnel). 두 번 부르면 정산이 두 벌 돈다. */
export function useFilterFunnel(): FunnelView {
    const stages = useWorkbench((s) => s.filterStages);
    const expandToPoints = useWorkbench((s) => s.filterExpandToPoints);
    const selection = useWorkbench((s) => s.funnelSelection);

    const gv = useGroups();
    const ax = useRankAxes();
    const candQ = useQuery(candidateDaysQuery());
    const pointsQ = useQuery(allPointsQuery());

    const isLoading = gv.isLoading || ax.isLoading || candQ.isLoading || pointsQ.isLoading;

    // ── 색인 ── 조립 규칙과 그 함정은 axisLookup 에(순수·테스트됨).
    const placements = useMemo(() => buildAxisOrderIndexes(ax.linesByAxis), [ax.linesByAxis]);

    /** 후보 하루 → 그 하루의 타점 시각들. 타점 0인 하루는 빈 배열(항목 하나로 남는다). */
    const timesByChart = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const p of pointsQ.data ?? []) {
            const k = chartKey(p);
            const list = m.get(k);
            if (list) list.push(p.time);
            else m.set(k, [p.time]);
        }
        return m;
    }, [pointsQ.data]);

    const axisScopes = useMemo(() => new Map(ax.axes.map((a) => [a.id, a.scope as Grain])), [ax.axes]);

    // ── 조회기 ────────────────────────────────────────────────────────────
    const grainLook = useMemo<GrainLookup>(
        () => ({
            groupScope: (id) => gv.groupById.get(id)?.scope,
            axisScope: (id) => axisScopes.get(id),
        }),
        [gv.groupById, axisScopes],
    );

    const evalLook = useMemo<EvalLookup>(
        () => ({
            // 시각이 있으면 타점 소속(직접 ∪ 하루 상속), 없으면 그 차트의 하루 소속.
            groupIdsOf: (i) =>
                i.time === undefined
                    ? gv.chartGroupIdsOf({ stockCode: i.stockCode, date: i.date })
                    : gv.groupIdsOf({ stockCode: i.stockCode, date: i.date, time: i.time }),
            hasGroup: (id) => gv.groupById.has(id),
            orderKeyOf: (axisId, i) => {
                const idx = placements.get(axisId);
                if (!idx) return undefined; // 지워진 축 — 판단 불가
                return i.time === undefined
                    ? idx.byChart.get(chartKey(i))
                    : idx.byPoint.get(pointKey({ stockCode: i.stockCode, date: i.date, time: i.time }));
            },
            slotOrderKey: (axisId, slotId) => placements.get(axisId)?.slots.get(slotId),
            // 계산 축 값은 타점 키로 온다(fanout). 타점 항목은 제 키로 직접, **하루 항목은 day 알갱이 축에서만**
            // 그날 아무 타점의 값으로(전부 같다 — dayAxisValueOf). point 축은 하루 항목을 판정할 수 없고(시각이
            // 값에 들어간다), 그 경우는 애초에 오지 않는다: point 축 단계가 있으면 해상도가 타점이라 하루 항목이 없다.
            axisValueOf: (axisId, i) => {
                const values = ax.computedValues.get(axisId);
                if (i.time !== undefined) return values?.get(pointKey({ stockCode: i.stockCode, date: i.date, time: i.time }));
                if (axisScopes.get(axisId) !== "day") return undefined;
                return dayAxisValueOf(values, i, timesByChart.get(chartKey(i)) ?? []);
            },
            boundValue: (axisId, b) => resolveBound(b, ax.computedValues.get(axisId)),
        }),
        [gv, placements, ax.computedValues, axisScopes, timesByChart],
    );

    // ── 정산 ── 표시와 정산이 **같은 순서**를 봐야 한다(하루 먼저) — 어긋나면 "상류"가 화면과 다른 걸 가리킨다.
    const stagesOrdered = useMemo(() => funnelOrder(stages, grainLook), [stages, grainLook]);
    const active = useMemo(() => activeStages(stagesOrdered.map((e) => e.stage)), [stagesOrdered]);

    // 사전이 온 뒤에만 해상도를 확정한다 — 로딩 중의 모름은 "없음"이 아니다.
    const auto = isLoading ? "day" : resolveAutoGrain(stages, grainLook);
    const grain = displayGrain(auto, expandToPoints);

    const items = useMemo<FunnelItem[]>(() => {
        if (isLoading) return [];
        return expandUniverse(candQ.data ?? [], grain, (c) => timesByChart.get(chartKey(c)) ?? []);
    }, [isLoading, candQ.data, grain, timesByChart]);

    const result = useMemo<FunnelResult | null>(
        () => (isLoading ? null : tallyFunnel(items, toFunnelStages(active, evalLook))),
        [isLoading, items, active, evalLook],
    );

    // 지금 보는 집합 — 칸들의 합집합(한 단계 안 칸들은 서로소라 dedupe 불필요). 짚은 게 없으면 최종 생존.
    const viewedItems = useMemo<FunnelItem[]>(() => {
        if (!result) return [];
        if (selection) {
            const i = active.findIndex((s) => s.id === selection.stageId);
            const t = i >= 0 ? result.stages[i] : undefined;
            if (t) return selection.cells.flatMap((c) => t.cells[c]);
        }
        return result.survivors;
    }, [result, selection, active]);

    const isFiltering = active.length > 0 || selection !== null;
    const viewedChartKeys = useMemo(() => new Set(viewedItems.map((i) => chartKey(i))), [viewedItems]);
    const viewedPointRefs = useMemo(() => {
        const out: { stockCode: string; date: string; time: string }[] = [];
        for (const it of viewedItems) {
            if (it.time !== undefined) out.push({ stockCode: it.stockCode, date: it.date, time: it.time });
            else for (const t of timesByChart.get(chartKey(it)) ?? []) out.push({ stockCode: it.stockCode, date: it.date, time: t });
        }
        return out;
    }, [viewedItems, timesByChart]);

    const deadStageIds = useMemo(
        () => (isLoading ? [] : stages.filter((s) => s.predicates.some((p) => isPredicateDead(p, grainLook))).map((s) => s.id)),
        [isLoading, stages, grainLook],
    );

    const labelLook = useMemo<LabelLookup>(
        () => ({
            groupName: (id) => gv.groupById.get(id)?.name,
            axisName: (id) => ax.axes.find((a) => a.id === id)?.name,
        }),
        [gv.groupById, ax.axes],
    );

    // 막힌 단계는 **앞선 단계만** 본다(상류의 정의). 판정을 다시 부르지만 한 항목뿐이라 값싸다.
    const blockedLabels = useMemo(
        () => (item: FunnelItem, stageIndex: number): string[] =>
            blockedBy(toFunnelStages(active, evalLook), stageIndex, item)
                .map((id) => active.find((s) => s.id === id))
                .filter((s): s is FilterStage => s != null)
                .map((s) => stageLabel(s, labelLook)),
        [active, evalLook, labelLook],
    );

    return {
        isLoading,
        grain,
        canExpandToPoints: canExpand(auto),
        universe: items.length,
        stagesOrdered,
        active,
        viewedItems,
        isFiltering,
        viewedChartKeys,
        viewedPointRefs,
        result,
        deadStageIds,
        labelLook,
        axes: ax,
        blockedLabels,
    };
}
