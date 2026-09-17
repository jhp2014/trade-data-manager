// 자동 타점 격자 한 벌 — **셸에서 한 번 파생해 나눠 준다**(GroupsContext 와 같은 이유).
//
// 소비자가 여섯이다(깔때기·시트·작업셋·레일의 usePointRows 4곳 + 축 합성(useRankAxesValue) + 차트 ◇ 마커).
// 각자 파생 훅을 직접 부르면 6,016 격자 × pointsOf(≈1만 객체 + byChart Map)가 인스턴스 수만큼 살고,
// 정의(pointDef)를 만질 때마다 그 전부가 동기 재계산된다. Provider 한 벌이면 파생은 앱에 하나다.
//
// ⚠ 이 Provider 는 RankAxesProvider **바깥**에 선다 — 축 합성이 자동 Point 를 재료로 쓴다.
import { createContext, useContext, type ReactNode } from "react";
import type { TradeSimParams } from "@trade-data-manager/market/domain";
import { useAutoPointsValue, usePointGridsValue, type AutoPointsView, type PointGridsView } from "./usePointGrids.js";
import { useLabelRowsValue, type LabelRowsView } from "./useLabelRows.js";
import { useOutcomeSlicesValue, useOutcomeWalksValue, type OutcomesView, type OutcomeWalksView } from "./useOutcomes.js";
import { useSimAtValue, useSimBasisValue, useTradeSimValue, type SimBasisView, type SimView } from "./useTradeSim.js";
import { useHotCountsValue, useHotPairsValue } from "./hotAxis.js";
import type { HotCounts, HotPairs } from "./hotPoints.js";

// 소비자는 이 파일 하나만 보면 되게 — 훅과 그 모양을 다른 곳에서 가져오게 하지 않는다.
export type { AutoPoint, AutoPointsView, PointGridsView } from "./usePointGrids.js";
export { autoPointsOfChart } from "./usePointGrids.js";
export type { LabelRowsView, LabelSignal } from "./useLabelRows.js";
export type { OutcomeMetric, OutcomeRecord, OutcomesView, OutcomeWalksView } from "./useOutcomes.js";
export type { SimBasisView, SimView } from "./useTradeSim.js";

const GridsCtx = createContext<PointGridsView | null>(null);
const AutoCtx = createContext<AutoPointsView | null>(null);
const LabelsCtx = createContext<LabelRowsView | null>(null);
const SlicesCtx = createContext<((t: number) => OutcomesView) | null>(null);
const WalksCtx = createContext<OutcomeWalksView | null>(null);
const SimBasisCtx = createContext<SimBasisView | null>(null);
const SimAtCtx = createContext<((params: TradeSimParams) => SimView) | null>(null);
const SimCtx = createContext<SimView | null>(null);
const HotCtx = createContext<((w: number, r: number) => HotCounts) | null>(null);
const HotPairsCtx = createContext<HotPairs | null>(null);

export function PointGridsProvider({ children }: { children: ReactNode }): JSX.Element {
    const grids = usePointGridsValue();
    const auto = useAutoPointsValue();
    // 라벨 행 원천(2026-09-18 B) — 종단 point 행·걷기·시뮬의 시그널은 **라벨 좌표**다(라벨=타점 진실).
    // GroupsProvider 가 이 Provider 바깥이라(main 배선) 여기서 멤버십을 읽을 수 있다.
    const labels = useLabelRowsValue();
    // 결과 파생 — 걷기(T 무관)·단면(T 의존) 두 층(useOutcomes 머리 주석). 시그널은 라벨 — 정의 무관.
    const walks = useOutcomeWalksValue(labels.signals, grids);
    const sliceAt = useOutcomeSlicesValue(walks);
    // 트레이드 시뮬 파생 — basis(취소 노브만)/파라미터 벌 접근자/전역 결과 세 층(useTradeSim 머리 주석).
    const simBasis = useSimBasisValue(labels.signals, grids);
    const simAt = useSimAtValue(labels.signals, grids);
    const sim = useTradeSimValue(simAt);
    // 급타점 파생 — 격자 파생(auto) 위의 축(은퇴 예정, 무접촉). 쌍 분포(노브 무관)·(W,r) 단면 두 층.
    const hotAt = useHotCountsValue(auto);
    const hotPairs = useHotPairsValue(auto);
    return (
        <GridsCtx.Provider value={grids}>
            <AutoCtx.Provider value={auto}>
                <LabelsCtx.Provider value={labels}>
                    <WalksCtx.Provider value={walks}>
                        <SlicesCtx.Provider value={sliceAt}>
                            <SimBasisCtx.Provider value={simBasis}>
                                <SimAtCtx.Provider value={simAt}>
                                    <SimCtx.Provider value={sim}>
                                        <HotPairsCtx.Provider value={hotPairs}>
                                            <HotCtx.Provider value={hotAt}>{children}</HotCtx.Provider>
                                        </HotPairsCtx.Provider>
                                    </SimCtx.Provider>
                                </SimAtCtx.Provider>
                            </SimBasisCtx.Provider>
                        </SlicesCtx.Provider>
                    </WalksCtx.Provider>
                </LabelsCtx.Provider>
            </AutoCtx.Provider>
        </GridsCtx.Provider>
    );
}

/** 라벨 행 원천 한 벌 — 종단 point 행(usePointRows)·per-chart 라벨 시각의 출처. */
export function useLabelRows(): LabelRowsView {
    const v = useContext(LabelsCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useLabelRows — main 배선을 확인하세요");
    return v;
}

/** 파라미터 벌 별 시뮬 접근자 — 조립 부품(payload 의 sim)·전역 노브가 같은 캐시를 지난다. */
export function useSimAt(): (params: TradeSimParams) => SimView {
    const v = useContext(SimAtCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useSimAt — main 배선을 확인하세요");
    return v;
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

/** 결과 걷기 한 벌(T 무관) — 분포 스트립(breakDepths)처럼 T 에 안 매인 재료의 출처. */
export function useOutcomeWalks(): OutcomeWalksView {
    const v = useContext(WalksCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useOutcomeWalks — main 배선을 확인하세요");
    return v;
}

/**
 * 시그널 결과 **T 별 단면 접근자** — 결과 패널·결과 시트·깔때기 평가가 전부 이걸 본다.
 * 조건마다 T 가 다르므로 단면은 하나가 아니다(2026-09-09 인스턴스화). 함수 신원은 걷기 층에만 매인다.
 */
export function useOutcomeSlices(): (t: number) => OutcomesView {
    const v = useContext(SlicesCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useOutcomeSlices — main 배선을 확인하세요");
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

/**
 * 급타점 수 **(W,r) 별 단면 접근자** — 급타점 패널·시트 열(축 경로)·깔때기 평가가 전부 이걸 본다.
 * 조건마다 (W,r) 이 다르므로 단면은 하나가 아니다(결과의 T 단면과 같은 규칙).
 */
export function useHotCounts(): (w: number, r: number) => HotCounts {
    const v = useContext(HotCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useHotCounts — main 배선을 확인하세요");
    return v;
}

/** 연속 타점 쌍의 간격·상승률 한 벌(노브 무관) — W·r 레일의 과녁. */
export function useHotPairs(): HotPairs {
    const v = useContext(HotPairsCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 useHotPairs — main 배선을 확인하세요");
    return v;
}
