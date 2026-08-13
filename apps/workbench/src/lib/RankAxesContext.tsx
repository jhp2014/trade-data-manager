// 축 한 벌(목록 + 배치줄 + 계산 축 값) — **셸에서 한 번 만들어 나눠 준다**(GroupsContext 와 같은 이유).
//
// 계산 축은 축마다 `타점키 → 수치` 맵을 만든다. 타점이 수천이면 그 맵 짓기가 부르는 화면 수만큼
// 그대로 늘어난다 — 시트·깔때기 계산·배치 조회가 각자 부르고 있었으니 세 벌이었다.
//
// ⚠ 이 Provider 도 FunnelProvider **바깥**에 선다 — 깔때기가 축 배치줄과 계산 축 값을 재료로 쓴다.
import { createContext, useContext, type ReactNode } from "react";
import { useRankAxesValue, type RankAxesView } from "./useRankAxes.js";

// 소비자는 이 파일 하나만 보면 되게 — 훅과 그 모양을 다른 곳에서 가져오게 하지 않는다.
export type { RankAxesView, ComputedAxisMeta } from "./useRankAxes.js";

const Ctx = createContext<RankAxesView | null>(null);

export function RankAxesProvider({ children }: { children: ReactNode }): JSX.Element {
    const v = useRankAxesValue();
    return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** 축 한 벌 구독 — 소비하는 곳은 전부 이걸 쓴다(useRankAxesValue 직접 호출 금지: 값 맵이 여러 벌 돈다). */
export function useRankAxes(): RankAxesView {
    const v = useContext(Ctx);
    if (!v) throw new Error("RankAxesProvider 밖에서 useRankAxes — main 배선을 확인하세요");
    return v;
}
