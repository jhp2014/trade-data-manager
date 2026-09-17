// 트레이드 시뮬 파생 한 벌 — basis(취소 노브만 의존)와 결과(전 노브 의존)를 **두 층으로 갈라 memo** 한다.
// 규칙: .claude/decisions.md 「시그널 결과」 트레이드 시뮬 항목.
//
// 층을 가르는 이유는 useOutcomes(걷기/단면)와 같은 성능 계약이다: 체결률 곡선의 재료(요구 타점 %)는
// 취소 노브에만 의존하고 진입 n 에 불변이라, **n 드래그 중 곡선이 안 움직이는 것**이 곡선의 존재
// 이유("여기 두면 몇 % 체결"이 재계산 없이 읽힌다)다. basis 를 결과와 합치면 그 계약을 어기기 쉬워
// 함수 경계로 못 박는다. 결과 층은 노브 어느 것을 만져도 전량 재걷기 — 시그널당 자기 차트 잔여 피벗
// 순회라 밀리초(walk-once 정교화 불요, planner 확정).
//
// **모수(깔때기 생존 집합) 필터링은 패널 몫이다** — 여기는 전 시그널 맵만 든다(시트 out: 열이 전 행을
// 봐야 하고, 생존 집합은 세션 상태라 파생 층에 섞으면 깔때기 드래그마다 전량 재걷기가 돈다).
// 소비자(시뮬 패널·시트 열)는 전부 PointGridsContext 의 useTradeSim/useSimBasis 를 본다(파생 1벌).
import { useMemo } from "react";
import {
    pointKeyOf,
    simFillBasis,
    simulate,
    type SimFillBasis,
    type SimResult,
    type TradeSimParams,
} from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { simKeyOf } from "./pointDef.js";
import type { LabelSignal } from "./useLabelRows.js";
import type { PointGridsView } from "./usePointGrids.js";

export interface SimBasisView {
    /** pointKey → 체결 basis. 키가 없는 건 격자 미도착뿐. */
    byKey: ReadonlyMap<string, SimFillBasis>;
    total: number;
}

export interface SimView {
    /** 이 결과를 만든 노브 한 벌(파서 통과값) — 패널 표기·시트 셀이 같은 것을 본다. */
    params: TradeSimParams;
    /** pointKey → 시뮬 결과. 키가 없는 건 격자 미도착뿐. */
    byKey: ReadonlyMap<string, SimResult>;
    total: number;
}

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 useSimBasis). */
export function useSimBasisValue(signals: readonly LabelSignal[], grids: PointGridsView): SimBasisView {
    // 취소 노브 2개 **원시값**만 구독 — pointDef.sim 객체를 통째 물면 setPointDef 가 매번 새 객체를
    // 만들어(파서 경유) 게이트 입력 하나에도 basis 전량이 재계산된다(useOutcomes 의 T 구독과 같은 함정).
    const cancelRisePct = useWorkbench((s) => s.pointDef.sim.cancelRisePct);
    const cancelAfterMin = useWorkbench((s) => s.pointDef.sim.cancelAfterMin);
    return useMemo(() => buildSimBasisView(signals, grids, { cancelRisePct, cancelAfterMin }), [signals, grids, cancelRisePct, cancelAfterMin]);
}

/** basis 조립(순수) — 시그널 = 라벨 좌표 + 봉 사실(simulate 와 같은 재료 — {min, close}). 테스트가 직접 잰다. */
export function buildSimBasisView(
    signals: readonly LabelSignal[],
    grids: PointGridsView,
    cancel: Pick<TradeSimParams, "cancelRisePct" | "cancelAfterMin">,
): SimBasisView {
    const byKey = new Map<string, SimFillBasis>();
    for (const s of signals) {
        const grid = grids.gridOf(s.stockCode, s.date);
        if (!grid) continue;
        byKey.set(pointKeyOf({ stockCode: s.stockCode, date: s.date, time: s.time }), simFillBasis(grid, { min: s.min, close: s.close }, cancel));
    }
    return { byKey, total: signals.length };
}

/** 동시 활성 시뮬 파라미터 벌 수 — 전역 노브 1 + 조립 부품 정의들 + 드래그 전이값. */
const MAX_SIM_SLICES = 4;

/**
 * ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 useSimAt).
 *
 * **파라미터 벌 별 시뮬 접근자** — 걷기가 정의 무관이 되면서(라벨 행) 시뮬의 남은 변수는 노브 7뿐이다.
 * 조립 부품이 제 payload 의 sim 으로 조회하고, 전역(useTradeSim)도 같은 캐시를 지난다(두 벌 안 돈다).
 * 신원은 시그널·격자에만 매인다 — 노브 드래그가 이 함수를 안 갈아 정산 캐시(materialsEpoch)가 안 터진다.
 */
export function useSimAtValue(signals: readonly LabelSignal[], grids: PointGridsView): (params: TradeSimParams) => SimView {
    return useMemo(() => {
        const cache = new Map<string, SimView>();
        return (params: TradeSimParams): SimView => {
            const key = simKeyOf(params);
            const hit = cache.get(key);
            if (hit !== undefined) {
                cache.delete(key); // LRU 갱신 — Map 삽입 순서가 곧 나이
                cache.set(key, hit);
                return hit;
            }
            const made = buildSimView(signals, grids, params);
            cache.set(key, made);
            if (cache.size > MAX_SIM_SLICES) cache.delete(cache.keys().next().value!);
            return made;
        };
    }, [signals, grids]);
}

/** ⚠ 직접 부르지 말 것 — 전역 노브 한 벌의 시뮬(시뮬 패널·시트 붙박이 열). simAt 캐시를 지난다. */
export function useTradeSimValue(simAt: (params: TradeSimParams) => SimView): SimView {
    // 노브 7 전부 **원시값** 구독(위와 같은 이유) — 판정 노브(게이트 등) 편집엔 재계산이 안 돈다.
    const entryPct = useWorkbench((s) => s.pointDef.sim.entry.pct);
    const stopPct = useWorkbench((s) => s.pointDef.sim.stopPct);
    const takePct = useWorkbench((s) => s.pointDef.sim.takePct);
    const trailUpPct = useWorkbench((s) => s.pointDef.sim.trailUpPct);
    const trailDownPct = useWorkbench((s) => s.pointDef.sim.trailDownPct);
    const cancelRisePct = useWorkbench((s) => s.pointDef.sim.cancelRisePct);
    const cancelAfterMin = useWorkbench((s) => s.pointDef.sim.cancelAfterMin);
    return useMemo(
        () =>
            simAt({
                entry: { anchor: "close", pct: entryPct },
                stopPct,
                takePct,
                trailUpPct,
                trailDownPct,
                cancelRisePct,
                cancelAfterMin,
            }),
        [simAt, entryPct, stopPct, takePct, trailUpPct, trailDownPct, cancelRisePct, cancelAfterMin],
    );
}

/** 결과 조립(순수) — params 는 파서(parseTradeSimParams)를 이미 지난 값이라 재정규화하지 않는다. */
export function buildSimView(signals: readonly LabelSignal[], grids: PointGridsView, params: TradeSimParams): SimView {
    const byKey = new Map<string, SimResult>();
    for (const s of signals) {
        const grid = grids.gridOf(s.stockCode, s.date);
        if (!grid) continue;
        byKey.set(pointKeyOf({ stockCode: s.stockCode, date: s.date, time: s.time }), simulate(grid, { min: s.min, close: s.close }, params));
    }
    return { params, byKey, total: signals.length };
}
