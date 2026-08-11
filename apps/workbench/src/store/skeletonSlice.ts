// skeletonSlice — 골격 패널(일봉/분봉)이 공유하는 차트 선택. 패널 연동의 단일 진실.
//
// 선택을 패널 로컬에서 store 로 올린 이유: 주 시나리오가 "일봉 골격에서 다중선택으로 무리를 만들고 →
// 분봉 패널이 그 선택을 '선택만 보기'로 받아 장중 경로를 확인"이라, 두 패널이 같은 집합을 봐야 한다.
// 키는 차트키(`종목|날짜`) — 두 해상도 골격 모두 차트 소유라서 해상도를 오가도 선택이 성립한다.
// 세션 한정(영속 없음): 선택은 조사 중의 손, 저장할 그룹은 그룹다.
import type { StateCreator } from "zustand";
import type { WorkbenchState } from "./workbench.js";

export interface SkeletonSlice {
    /** 골격 패널들의 차트 선택(차트키 집합). */
    skeletonSelection: ReadonlySet<string>;
    /** React setState 꼴(값 또는 updater) — 패널의 누적 선택(prev ∪ hit)이 스냅샷 경합 없이 서게. */
    setSkeletonSelection: (next: ReadonlySet<string> | ((prev: ReadonlySet<string>) => ReadonlySet<string>)) => void;
}

export const createSkeletonSlice: StateCreator<WorkbenchState, [], [], SkeletonSlice> = (set) => ({
    skeletonSelection: new Set(),
    setSkeletonSelection: (next) =>
        set((s) => ({ skeletonSelection: typeof next === "function" ? next(s.skeletonSelection) : next })),
});
