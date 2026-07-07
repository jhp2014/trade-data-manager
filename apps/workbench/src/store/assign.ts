import { create } from "zustand";

// 테마 배정 팝업 상태 — 종목명 우클릭이 open(종목), 팝업이 close. 연동버스(Focus/Scope)와 무관한 순수 UI 상태라
// workbench 스토어를 안 건드리고 여기 따로 둔다(모달은 shell 위 단일 오버레이). 대상은 code+name 만(전체는 팝업이 조회).
export interface AssignTarget {
    code: string;
    name: string;
}

interface AssignState {
    target: AssignTarget | null;
    open: (target: AssignTarget) => void;
    close: () => void;
}

export const useAssign = create<AssignState>((set) => ({
    target: null,
    open: (target) => set({ target }),
    close: () => set({ target: null }),
}));
