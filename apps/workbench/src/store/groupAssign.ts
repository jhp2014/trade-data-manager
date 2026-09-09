import { create } from "zustand";

// 그룹 배정 팝오버 상태 — 우클릭(시트/작업대상 행·차트 ◇·타점정보)이 open(대상+커서좌표), 팝오버가 close.
// 테마 배정(store/assign)과 같은 결: 연동버스와 무관한 순수 UI 상태라 workbench 스토어 밖 전용 스토어 +
// App 루트 단일 마운트. **time 유무가 곧 입구 grain 이다** — 있으면 타점 입구(두 섹션), 없으면 day 입구(한 섹션).
export interface GroupAssignTarget {
    stockCode: string;
    /** 표시용 종목명 — 입구가 이미 들고 있는 값(없으면 코드로 표시). 팝오버는 추가 조회를 하지 않는다. */
    name?: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM:SS — 있으면 타점 입구
}

interface GroupAssignState {
    target: GroupAssignTarget | null;
    anchor: { x: number; y: number } | null;
    open: (target: GroupAssignTarget, anchor: { x: number; y: number }) => void;
    close: () => void;
}

export const useGroupAssign = create<GroupAssignState>((set) => ({
    target: null,
    anchor: null,
    open: (target, anchor) => set({ target, anchor }),
    close: () => set({ target: null, anchor: null }),
}));
