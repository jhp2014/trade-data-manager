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
    expandUniverse, tallyFunnel, type FunnelItem, type FunnelResult,
} from "@trade-data-manager/market/domain";
import { allPointsQuery, candidateDaysQuery } from "../../api/queries.js";
import { useGroups } from "../../lib/useGroups.js";
import { useRankAxes } from "../../lib/useRankAxes.js";
import { chartKey, pointKey } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { buildAxisOrderIndexes } from "./axisLookup.js";
import { toFunnelStages, type EvalLookup } from "./evaluate.js";
import {
    activeStages, canExpand, displayGrain, isPredicateDead, resolveAutoGrain,
    type FilterStage, type Grain, type GrainLookup,
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
    /** 평가에 실제로 들어간 단계 — 막대가 이 순서로 그려진다(순서 = 이야기). */
    active: FilterStage[];
    /** 정산 결과. 로딩 중이면 null. */
    result: FunnelResult | null;
    /** 죽은 참조(지워진 그룹·축)를 든 단계 id — 화면이 표시하고, 정리는 사용자가 결정한다. */
    deadStageIds: string[];
}

export function useFilterFunnel(): FunnelView {
    const stages = useWorkbench((s) => s.filterStages);
    const expandToPoints = useWorkbench((s) => s.filterExpandToPoints);

    const gv = useGroups();
    const ax = useRankAxes({ includeComputed: true });
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
            // 계산 축 값은 타점 키로 저장된다 — 하루 항목은 아직 값이 없다(계산 축 day 알갱이 미구현).
            // 그건 결손이고, 결손은 탈락이 아니라 미배치라 조용히 사라지지 않는다.
            axisValueOf: (axisId, i) =>
                i.time === undefined
                    ? undefined
                    : ax.computedValues.get(axisId)?.get(pointKey({ stockCode: i.stockCode, date: i.date, time: i.time })),
            boundValue: (axisId, b) =>
                b.kind === "value"
                    ? (Number.isFinite(b.value) ? b.value : undefined)
                    : ax.computedValues.get(axisId)?.get(b.point),
        }),
        [gv, placements, ax.computedValues],
    );

    // ── 정산 ──────────────────────────────────────────────────────────────
    const active = useMemo(() => activeStages(stages), [stages]);

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

    const deadStageIds = useMemo(
        () => (isLoading ? [] : stages.filter((s) => s.predicates.some((p) => isPredicateDead(p, grainLook))).map((s) => s.id)),
        [isLoading, stages, grainLook],
    );

    return {
        isLoading,
        grain,
        canExpandToPoints: canExpand(auto),
        universe: items.length,
        active,
        result,
        deadStageIds,
    };
}
