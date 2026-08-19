// 깔때기 배선 — 조각 넷을 실제 데이터로 잇는 단 하나의 자리.
//   유니버스(후보 하루) → 표시 알갱이로 펼치기 → 단계별 3치 판정 → 정산(5칸·한계 기여도)
//
// 순수 조각들(stage·evaluate·core/funnel)은 이 훅 없이도 테스트되고, 여기서는 **재료를 꽂는 일만** 한다.
// 그래서 저장 방식이 바뀌면 이 파일만 바뀐다.
//
// ⚠ **사전이 오기 전에는 아무것도 정하지 않는다.** 알갱이 판정이 사전을 보는데, 로딩 중의 "모름"은
// "없음"이 아니라 "곧 옴"이다. 그때 해상도를 확정하면 사전이 도착하는 순간 화면이 통째로 다시 그려지고,
// 더 나쁘게는 그 사이의 5칸 숫자가 전부 미배치로 부풀어 사용자가 그걸 사실로 읽는다.
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    expandUniverse, tallyFunnel, type FunnelItem, type FunnelResult,
} from "@trade-data-manager/market/domain";
import { allPointsQuery, candidateDaysQuery } from "../../api/queries.js";
import { expandToPointItems } from "../../lib/grainView.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { chartKey, pointKey } from "../../lib/pointKey.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { useWorkbench } from "../../store/workbench.js";
import { buildAxisOrderIndexes, dayAxisValueOf } from "./axisLookup.js";
import { resolveBound, toFunnelStages, type EvalLookup } from "./evaluate.js";
import type { LabelLookup } from "./label.js";
import { resolveSetRef, type ResolvedSet, type SetResolveCtx } from "./resolveSet.js";
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
    // ⚠ "지금 보는 집합"(viewedItems 등)은 **계약에 없다** — viewOf 로만 나간다. 한때 최상위 필드였는데,
    // 선택 포인터 도입 후 그 필드는 포인터를 무시한 작업 깔때기 시선이라, 직접 읽는 소비자가 생기는
    // 순간 "목록에서 집합을 골랐는데 이 패널만 안 따라온다"는 조용한 갈림이 된다.
    /** 정산 결과. 로딩 중이면 null. */
    result: FunnelResult | null;
    /** 죽은 참조(지워진 그룹·축)를 든 단계 id — 화면이 표시하고, 정리는 사용자가 결정한다. */
    deadStageIds: string[];
    /** 이름 조회 — 깔때기가 이미 사전을 들고 있으니 라벨을 만드는 자리마다 다시 조립하지 않게. */
    labelLook: LabelLookup;
    // 축 재료(axes)는 **여기서 실어 나르지 않는다.** 한때 필드로 있었던 건 소비자가 useRankAxes 를
    // 다시 부르면 계산 축 값 맵이 여러 벌 만들어졌기 때문인데, 이제 RankAxesProvider 가 한 벌을
    // 보장하므로 그 이유가 사라졌다. 축이 필요한 화면은 useRankAxes() 를 직접 부른다 —
    // 깔때기 계약에 남겨 두면 "축을 어디서 얻나"의 답이 둘이 된다.
    // (blockedLabels — "이 항목을 어느 단계가 막았나" — 도 있었다: 결과 목록의 열이었는데 목록과
    //  함께 갔다. 필요해지면 blockedBy(core)를 다시 감싸면 된다.)
    /**
     * 집합 참조 풀기 — 짚음 채널·패널 바인딩이 실은 SetRef 를 항목 집합으로. 깔때기가 이미 들고 있는
     * 재료(유니버스·사전·판정기)를 그대로 쓰므로 **여기가 유일한 리졸버 자리**다(두 벌이면 딴 답을 낸다).
     * 같은 참조는 캐시로 한 번만 푼다(정규화 키) — 재료가 바뀌면 캐시째 새로 선다. 로딩 중엔 빈 집합.
     */
    resolveSet: (ref: SetRef) => ResolvedSet;
    /**
     * 패널이 보는 집합 — **바인딩 하나로 위의 viewed* 계약과 같은 모양**을 돌려준다.
     * null = **연동**(필터 패널의 선택 포인터를 따라간다 — 목록에서 고른 집합, 없으면 작업 깔때기 시선),
     * 참조 = 그 집합에 고정(층위 변환 포함).
     * 소비 패널은 viewOf(자기 바인딩) 하나만 읽으면 되고, 바인딩이 없던 시절의 코드와 같은 필드를 쓴다.
     */
    viewOf: (ref: SetRef | null) => ViewedSet;
}

/** 구독 패널이 소비하는 "보는 집합"의 계약 — FunnelView 의 viewed·isFiltering 필드와 같은 모양. */
export interface ViewedSet {
    /**
     * 걸린 게 있나 — false 면 구독자는 거르지 않는다(전체 = 제한 없음). 명시 바인딩은 로딩이 끝나면 true.
     * ⚠ 로딩 가드가 **여기 들어 있다**(로딩 중 false) — 판정이 안 끝난 빈 집합으로 거르면 빈 화면이
     * "조건에 다 걸렸다"로 읽히는데, 그 가드를 소비자마다 되풀이하게 두면 하나는 반드시 빠뜨린다.
     */
    isFiltering: boolean;
    /** 깨진 참조(지워진 그룹·필터·단계) — 빈 집합과 구분해 화면이 이유를 말해야 한다(자동 폴백 금지). */
    broken: boolean;
    viewedItems: FunnelItem[];
    viewedChartKeys: Set<string>;
    viewedPointRefs: { stockCode: string; date: string; time: string }[];
}

/** ⚠ 직접 부르지 말 것 — FunnelProvider 가 유일한 호출자다(소비는 useFunnel). 두 번 부르면 정산이 두 벌 돈다. */
export function useFilterFunnel(): FunnelView {
    const stages = useWorkbench((s) => s.filterStages);
    const expandToPoints = useWorkbench((s) => s.filterExpandToPoints);
    const selection = useWorkbench((s) => s.funnelSelection);
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);

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

    const axisScopes = useMemo(() => new Map(ax.axes.map((a) => [a.key, a.scope as Grain])), [ax.axes]);

    // ── 조회기 ────────────────────────────────────────────────────────────
    const grainLook = useMemo<GrainLookup>(
        () => ({
            groupScope: (id) => gv.groupByName.get(id)?.scope,
            axisScope: (id) => axisScopes.get(id),
        }),
        [gv.groupByName, axisScopes],
    );

    const evalLook = useMemo<EvalLookup>(
        () => ({
            // 적용 집합(직접 ∪ 하루 상속 ∪ 계층 조상) — "테마" 필터가 "테마 ▸ 2차전지" 소속도 잡는다.
            groupNamesOf: (i) => gv.appliedGroupNamesOf({ stockCode: i.stockCode, date: i.date, time: i.time }),
            hasGroup: (id) => gv.groupByName.has(id),
            orderKeyOf: (axisId, i) => {
                const idx = placements.get(axisId);
                if (!idx) return undefined; // 지워진 축 — 판단 불가
                return i.time === undefined
                    ? idx.byChart.get(chartKey(i))
                    : idx.byPoint.get(pointKey({ stockCode: i.stockCode, date: i.date, time: i.time }));
            },
            bandBoundOrderKey: (axisKey, point) => placements.get(axisKey)?.byPoint.get(point),
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

    /**
     * 리졸버 — 재료가 하나라도 바뀌면 함수째 새로 서고(useMemo), 그 안의 캐시도 같이 버려진다.
     * 활성 슬롯(null)은 **위 정산(result)을 그대로 재사용**한다(ctx.activeFilter) — 두 번 평가하지
     * 않을 뿐 아니라, "깔때기 시선"과 "최종 생존" 바인딩이 같은 grain("타점으로 펼치기" 반영)으로 풀린다.
     */
    const resolveSet = useMemo(() => {
        const cache = new Map<string, ResolvedSet>();
        const ctx: SetResolveCtx = {
            candidates: candQ.data ?? [],
            timesOf: (c) => timesByChart.get(chartKey(c)) ?? [],
            appliedGroupNamesOf: (i) => gv.appliedGroupNamesOf({ stockCode: i.stockCode, date: i.date, time: i.time }),
            groupScope: (n) => gv.groupByName.get(n)?.scope,
            activeStages: stages,
            savedSetOf: (id) => savedSets.find((f) => f.id === id),
            ...(result !== null ? { activeFilter: { grain, active, tally: result } } : {}),
            evalLook,
            grainLook,
        };
        return (ref: SetRef): ResolvedSet => {
            const k = setRefKey(ref);
            const hit = cache.get(k);
            if (hit) return hit;
            const r: ResolvedSet = isLoading ? { broken: false, grain: "day", items: [] } : resolveSetRef(ref, ctx);
            cache.set(k, r);
            return r;
        };
    }, [candQ.data, timesByChart, gv, evalLook, grainLook, stages, savedSets, isLoading, grain, active, result]);

    // 지금 보는 집합 — 짚은 칸이면 그 **칸 참조를 리졸버로** 푼다(칸 합집합 구현은 리졸버 한 벌뿐이어야
    // 한다 — 두 벌이면 언젠가 다른 답을 낸다). 리졸버는 위 정산을 재사용하므로 비용은 fold 하나 그대로.
    // 칸이 못 풀리면(단계가 지워짐·꺼짐 — 편집 경로가 시선을 정리하므로 과도기뿐) 최종 생존으로.
    const viewedItems = useMemo<FunnelItem[]>(() => {
        if (!result) return [];
        if (selection) {
            const r = resolveSet({ kind: "cell", stageId: selection.stageId, cells: selection.cells });
            if (!r.broken) return r.items;
        }
        return result.survivors;
    }, [result, selection, resolveSet]);

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

    // 작업 깔때기 시선 뷰 — 시선(짚은 칸)이 바뀔 때만 새로 선다. 바인딩 뷰 캐시와 **일부러 분리**한다: 명시 바인딩의
    // 값은 시선과 무관한데 한 메모에 두면 칸 클릭마다 캐시가 통째로 버려져 바인딩 패널들이 헛돈다.
    // isFiltering 의 로딩 가드는 **뷰 계약 안에** 둔다 — 소비자마다 가드를 되풀이하면 하나는 빠뜨린다
    // (실제로 시트가 빠뜨려 로딩 중을 "조건에 맞는 타점이 없습니다"로 말했다).
    const gazeView = useMemo<ViewedSet>(
        () => ({ isFiltering: !isLoading && isFiltering, broken: false, viewedItems, viewedChartKeys, viewedPointRefs }),
        [isLoading, isFiltering, viewedItems, viewedChartKeys, viewedPointRefs],
    );
    const boundViewOf = useMemo(() => {
        const cache = new Map<string, ViewedSet>();
        return (ref: SetRef): ViewedSet => {
            const k = setRefKey(ref);
            const hit = cache.get(k);
            if (hit) return hit;
            const r = resolveSet(ref);
            const v: ViewedSet = {
                isFiltering: !isLoading, // 로딩 중의 빈 집합으로 거르면 "조건에 다 걸렸다"로 읽힌다
                broken: r.broken,
                viewedItems: r.items,
                viewedChartKeys: new Set(r.items.map((i) => chartKey(i))),
                // 전개(∀) — 하루 항목은 그날 타점 전부로. 타점 0인 하루는 대표가 없다(결손으로 보일 자리).
                viewedPointRefs: expandToPointItems(r.items, (c) => timesByChart.get(chartKey(c)) ?? [])
                    .map((i) => ({ stockCode: i.stockCode, date: i.date, time: i.time! })),
            };
            cache.set(k, v);
            return v;
        };
    }, [resolveSet, timesByChart, isLoading]);
    // 연동(null) = **선택 포인터를 따라간다**: 목록에서 집합을 고르면 그 집합, 깔때기를 만지는 순간
    // 작업 깔때기 시선으로 복귀(포인터 리셋은 슬라이스가 한다 — 여기는 읽기만).
    const viewOf = useCallback(
        (ref: SetRef | null): ViewedSet => {
            const target = ref ?? selectedSetRef;
            return target === null ? gazeView : boundViewOf(target);
        },
        [gazeView, boundViewOf, selectedSetRef],
    );

    const labelLook = useMemo<LabelLookup>(
        () => ({
            groupName: (id) => gv.groupByName.get(id)?.name,
            axisName: (id) => ax.axes.find((a) => a.key === id)?.name,
        }),
        [gv.groupByName, ax.axes],
    );

    return {
        isLoading,
        grain,
        canExpandToPoints: canExpand(auto),
        universe: items.length,
        stagesOrdered,
        active,
        result,
        deadStageIds,
        labelLook,
        resolveSet,
        viewOf,
    };
}
