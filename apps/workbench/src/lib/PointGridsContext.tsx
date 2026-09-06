// 자동 타점 격자 한 벌 — **셸에서 한 번 파생해 나눠 준다**(GroupsContext 와 같은 이유).
//
// 소비자가 여섯이다(깔때기·시트·작업셋·레일의 usePointRows 4곳 + 축 합성(useRankAxesValue) + 차트 ◇ 마커).
// 각자 파생 훅을 직접 부르면 6,016 격자 × pointsOf(≈1만 객체 + byChart Map)가 인스턴스 수만큼 살고,
// 정의(pointDef)를 만질 때마다 그 전부가 동기 재계산된다. Provider 한 벌이면 파생은 앱에 하나다.
//
// ⚠ 이 Provider 는 RankAxesProvider **바깥**에 선다 — 축 합성이 자동 Point 를 재료로 쓴다.
import { createContext, useContext, type ReactNode } from "react";
import { useAutoPointsValue, usePointGridsValue, type AutoPointsView, type PointGridsView } from "./usePointGrids.js";
import { useOutcomesValue, useOutcomeWalksValue, type OutcomesView } from "./useOutcomes.js";
import { useSimBasisValue, useTradeSimValue, type SimBasisView, type SimView } from "./useTradeSim.js";

// 소비자는 이 파일 하나만 보면 되게 — 훅과 그 모양을 다른 곳에서 가져오게 하지 않는다.
export type { AutoPoint, AutoPointsView, PointGridsView } from "./usePointGrids.js";
export { autoPointsOfChart } from "./usePointGrids.js";
export type { OutcomeMetric, OutcomeRecord, OutcomesView } from "./useOutcomes.js";
export type { SimBasisView, SimView } from "./useTradeSim.js";

const GridsCtx = createContext<PointGridsView | null>(null);
const AutoCtx = createContext<AutoPointsView | null>(null);
const OutcomesCtx = createContext<OutcomesView | null>(null);
const SimBasisCtx = createContext<SimBasisView | null>(null);
const SimCtx = createContext<SimView | null>(null);

export function PointGridsProvider({ children }: { children: ReactNode }): JSX.Element {
    const grids = usePointGridsValue();
    const auto = useAutoPointsValue();
    // 결과 파생 — 걷기(T 무관)·단면(T 의존) 두 층(useOutcomes 머리 주석). 같은 Provider 에 얹어
    // main·테스트 배선 무변경 + Provider 순서 규칙(격자 → 축 → 깔때기) 유지.
    const walks = useOutcomeWalksValue(auto, grids);
    const outcomes = useOutcomesValue(walks);
    // 트레이드 시뮬 파생 — basis(취소 노브만)/결과(전 노브) 두 층(useTradeSim 머리 주석).
    const simBasis = useSimBasisValue(auto, grids);
    const sim = useTradeSimValue(auto, grids);
    return (
        <GridsCtx.Provider value={grids}>
            <AutoCtx.Provider value={auto}>
                <OutcomesCtx.Provider value={outcomes}>
                    <SimBasisCtx.Provider value={simBasis}>
                        <SimCtx.Provider value={sim}>{children}</SimCtx.Provider>
                    </SimBasisCtx.Provider>
                </OutcomesCtx.Provider>
            </AutoCtx.Provider>
        </GridsCtx.Provider>
    );
}

/** 체결 basis 한 벌(취소 노브만 의존 — 체결률 곡선 재료). 시뮬 패널이 본다. */
export function useSimBasis(): SimBasisView {
    const v = useContext(SimBasisCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useSimBasis — main 배선을 확인하세요");
    return v;
}

/** 트레이드 시뮬 결과 한 벌 — 시뮬 패널·시트 시뮬 열이 전부 이걸 본다. */
export function useTradeSim(): SimView {
    const v = useContext(SimCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useTradeSim — main 배선을 확인하세요");
    return v;
}

/** 시그널 결과 파생 한 벌 — 결과 패널·결과 시트·깔때기 평가가 전부 이걸 본다. */
export function useOutcomes(): OutcomesView {
    const v = useContext(OutcomesCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useOutcomes — main 배선을 확인하세요");
    return v;
}

/** 격자 조회 한 벌 — 소비하는 곳은 전부 이걸 쓴다(usePointGridsValue 직접 호출 금지: 인덱스가 여러 벌 돈다). */
export function usePointGrids(): PointGridsView {
    const v = useContext(GridsCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 usePointGrids — main 배선을 확인하세요");
    return v;
}

/** 자동 Point 파생 한 벌 — useAutoPointsValue 직접 호출 금지(파생이 여러 벌 돈다). */
export function useAutoPoints(): AutoPointsView {
    const v = useContext(AutoCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useAutoPoints — main 배선을 확인하세요");
    return v;
}
