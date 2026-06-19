import { create } from "zustand";
import type { WorkingSetMode } from "@/repositories/workingSetSources";

/** 오늘 기준 YYYY-MM. */
export function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

/**
 * 작업대 설정 상태(클라이언트). 작업셋 모드와 설정 모달 열림 여부.
 * 모드는 월별(기본=이번 달) / 시트 / 연결된 것만.
 */
type WorkbenchState = {
    mode: WorkingSetMode;
    settingsOpen: boolean;
    setMode: (mode: WorkingSetMode) => void;
    openSettings: () => void;
    closeSettings: () => void;
};

export const useWorkbench = create<WorkbenchState>((set) => ({
    mode: { kind: "review-month", month: currentMonth() },
    settingsOpen: false,
    setMode: (mode) => set({ mode }),
    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),
}));
