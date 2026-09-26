// 자동 타점 격자 번들 한 벌 — **셸에서 한 번 받아 나눠 준다**(GroupsContext 와 같은 이유).
// 2026-09-26 종단 폐기: 라벨·걷기·시뮬·급타점·자동 Point 파생 층은 전부 은퇴 — 남은 것은 번들 조회
// (돌파 기준선 grid.base — useCellSet·useChainOverlay·캔들 기준선 축의 재료)뿐이다.
import { createContext, useContext, type ReactNode } from "react";
import { usePointGridsValue, type PointGridsView } from "./usePointGrids.js";

export type { PointGridsView } from "./usePointGrids.js";

const GridsCtx = createContext<PointGridsView | null>(null);

export function PointGridsProvider({ children }: { children: ReactNode }): JSX.Element {
    const grids = usePointGridsValue();
    return <GridsCtx.Provider value={grids}>{children}</GridsCtx.Provider>;
}

/** 격자 조회 한 벌 — 소비하는 곳은 전부 이걸 쓴다(usePointGridsValue 직접 호출 금지: 인덱스가 여러 벌 돈다). */
export function usePointGrids(): PointGridsView {
    const v = useContext(GridsCtx);
    if (!v) throw new Error("PointGridsProvider 밖에서 usePointGrids — main 배선을 확인하세요");
    return v;
}
