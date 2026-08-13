// 깔때기 계산 한 벌 — **셸에서 한 번 계산해 나눠 준다.**
//
// 소비자가 다섯이다(깔때기 패널·골격 일봉·골격 분봉·시트·분석). 각자 useFilterFunnel 을 부르면 같은
// 정산(tallyFunnel — 유니버스 × 단계)이 인스턴스 수만큼 돌고, 단계가 늘수록 그 낭비가 선형으로 는다.
// 계산 훅은 그대로 두고(테스트·순수 조각의 조립처) Provider 가 유일한 호출자가 된다.
//
// 대가: 깔때기를 안 보는 화면에서도 계산이 돈다. 재료 쿼리(react-query)는 어차피 공유 캐시라 왕복이
// 늘지 않고, 정산 자체는 ms 단위라 수용한다 — 패널마다 켜고 끄는 조건부 계산은 "어느 패널이 계산을
// 들고 있나"라는 새 질문을 만든다(구독자가 곧 계산자면 마지막 패널을 닫을 때 집합이 사라진다).
import { createContext, useContext, type ReactNode } from "react";
import { useFilterFunnel, type FunnelView } from "./useFilterFunnel.js";

const Ctx = createContext<FunnelView | null>(null);

export function FunnelProvider({ children }: { children: ReactNode }): JSX.Element {
    const v = useFilterFunnel();
    return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** 깔때기 뷰 구독 — 소비 패널은 전부 이걸 쓴다(직접 useFilterFunnel 호출 금지: 계산이 두 벌 돈다). */
export function useFunnel(): FunnelView {
    const v = useContext(Ctx);
    if (!v) throw new Error("FunnelProvider 밖에서 useFunnel — App 배선을 확인하세요");
    return v;
}
