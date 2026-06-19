import { create } from "zustand";

/**
 * 화면 간 공유 선택 상태(클라이언트). 좌측 case 선택 / 중앙·그래프 가설 선택을
 * 한곳에 두어 패널 간 동기화한다. (서버 데이터는 React Query, 선택상태는 여기)
 */
type SelectionState = {
    selectedCaseId: string | null;
    selectedHypothesisId: string | null;
    /** 가설 설정(태그·관계) 모달 대상. null 이면 닫힘. */
    modalHypothesisId: string | null;
    selectCase: (caseId: string | null) => void;
    selectHypothesis: (hypothesisId: string | null) => void;
    openHypothesisModal: (hypothesisId: string) => void;
    closeHypothesisModal: () => void;
};

export const useSelection = create<SelectionState>((set) => ({
    selectedCaseId: null,
    selectedHypothesisId: null,
    modalHypothesisId: null,
    selectCase: (caseId) => set({ selectedCaseId: caseId }),
    selectHypothesis: (hypothesisId) => set({ selectedHypothesisId: hypothesisId }),
    openHypothesisModal: (hypothesisId) => set({ modalHypothesisId: hypothesisId }),
    closeHypothesisModal: () => set({ modalHypothesisId: null }),
}));
