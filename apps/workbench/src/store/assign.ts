import { create } from "zustand";

// 테마 배정 팝업 상태 — 종목명 우클릭이 open(종목+커서좌표), 팝업이 close. 연동버스(Focus/Scope)와 무관한 순수 UI 상태라
// workbench 스토어를 안 건드리고 여기 따로 둔다(팝오버는 shell 위 단일 오버레이). 대상은 code+name 만(전체는 팝업이 조회).
export interface AssignTarget {
    code: string;
    name: string;
}
// 우클릭한 커서 좌표 — 컨텍스트 팝오버를 그 위치에 앵커한다.
export interface AssignAnchor {
    x: number;
    y: number;
}

interface AssignState {
    target: AssignTarget | null;
    anchor: AssignAnchor | null;
    open: (target: AssignTarget, anchor: AssignAnchor) => void;
    close: () => void;
}

export const useAssign = create<AssignState>((set) => ({
    target: null,
    anchor: null,
    open: (target, anchor) => set({ target, anchor }),
    close: () => set({ target: null, anchor: null }),
}));
