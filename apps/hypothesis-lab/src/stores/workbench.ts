import { create } from "zustand";
import type { WorkingSetMode } from "@/repositories/workingSetSources";

/** 오늘 기준 YYYY-MM. */
export function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

/**
 * 작업대가 상단 Case 레일을 채우는 방식.
 * - "workingset": 외부 소스 스코프(월별/시트/연결된것만)를 `mode` 로 로드.
 * - "boolean": `expr` 불리언식을 snapshot.cases 전체에 평가한 결과를 레일에 표시.
 */
export type FilterMode = "workingset" | "boolean";

/**
 * 작업대 설정 상태(클라이언트). 레일 채우기 방식·작업셋 모드·식·설정 모달 열림.
 */
type WorkbenchState = {
    filterMode: FilterMode;
    mode: WorkingSetMode;
    expr: string;
    settingsOpen: boolean;
    setFilterMode: (filterMode: FilterMode) => void;
    setMode: (mode: WorkingSetMode) => void;
    setExpr: (expr: string) => void;
    openSettings: () => void;
    closeSettings: () => void;
};

export const useWorkbench = create<WorkbenchState>((set) => ({
    filterMode: "workingset",
    mode: { kind: "review-month", month: currentMonth() },
    expr: "",
    settingsOpen: false,
    setFilterMode: (filterMode) => set({ filterMode }),
    setMode: (mode) => set({ mode }),
    setExpr: (expr) => set({ expr }),
    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),
}));
