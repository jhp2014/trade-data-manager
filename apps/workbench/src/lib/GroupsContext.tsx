// 그룹 한 벌 — **셸에서 한 번 만들어 나눠 준다**(깔때기와 같은 이유, FunnelContext 참고).
//
// 소비자가 일곱이다(차트 단축키·차트 패널·타점 정보·필터 보드·그룹 팔레트·골격·맵·깔때기 계산).
// 각자 useGroups 를 부르면 **멤버십 피드 전체를 훑는 색인 셋**(타점 소속·차트 소속·그룹별 빈도)이
// 인스턴스 수만큼 만들어진다. 피드는 편집물 전량이라 화면 수에 비례해 그 비용이 그대로 는다.
//
// 덤으로 낙관적 토글이 단순해진다: 인스턴스가 여럿일 땐 연타 중 마지막 요청을 알아내려고
// mutationKey 로 비행 중인 것을 세야 했는데, 한 벌이면 그 조율의 전제 자체가 사라진다(그 코드는
// 그대로 두어도 무해하지만, 이제 "왜 세는가"의 답이 하나다 — 연타 자체를 세는 것).
//
// ⚠ 이 Provider 는 FunnelProvider **바깥**에 선다 — 깔때기 계산이 그룹 사전을 재료로 쓴다.
import { createContext, useContext, type ReactNode } from "react";
import { useGroupsValue, type GroupsView } from "./useGroups.js";

// 소비자는 이 파일 하나만 보면 되게 — 훅과 그 모양을 다른 곳에서 가져오게 하지 않는다.
export type { GroupsView, ChartGroupRef } from "./useGroups.js";

const Ctx = createContext<GroupsView | null>(null);

export function GroupsProvider({ children }: { children: ReactNode }): JSX.Element {
    const v = useGroupsValue();
    return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** 그룹 한 벌 구독 — 소비하는 곳은 전부 이걸 쓴다(useGroupsValue 직접 호출 금지: 색인이 여러 벌 돈다). */
export function useGroups(): GroupsView {
    const v = useContext(Ctx);
    if (!v) throw new Error("GroupsProvider 밖에서 useGroups — main 배선을 확인하세요");
    return v;
}
