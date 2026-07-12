import { create } from "zustand";
import type { Scope } from "../keymap/types.js";

// UI 상태 버스(Focus/Scope 연동버스와 별개) — 모달·오버레이 등 전역 UI 토글과 활성 scope.
// 커맨드가 useUi.getState() 로 직접 조작(디스패처가 ctx 를 배선하지 않아도 됨).
export type SettingsScreen = "theme" | "replay" | "point" | "chart" | "layout" | "shortcuts";

interface UiState {
    settingsOpen: boolean;
    settingsScreen: SettingsScreen; // 모달이 열릴 때 보여줄 화면(커맨드가 특정 화면으로 열 수 있게).
    activeScope: Scope; // 현재 포커스된 영역(디스패처의 scope 필터). 패널이 포커스 시 설정(후속 벽돌).
    boardShowReasons: boolean; // 보드 dim 종목: 제외 사유 뱃지(true) vs 테마 칩(false, 기본). 3보드 공통.
    openSettings: (screen?: SettingsScreen) => void;
    closeSettings: () => void;
    setActiveScope: (scope: Scope) => void;
    toggleBoardReasons: () => void;
}

export const useUi = create<UiState>((set) => ({
    settingsOpen: false,
    settingsScreen: "theme",
    activeScope: "global",
    boardShowReasons: false,
    openSettings: (screen) => set((s) => ({ settingsOpen: true, settingsScreen: screen ?? s.settingsScreen })),
    closeSettings: () => set({ settingsOpen: false }),
    setActiveScope: (scope) => set({ activeScope: scope }),
    toggleBoardReasons: () => set((s) => ({ boardShowReasons: !s.boardShowReasons })),
}));
