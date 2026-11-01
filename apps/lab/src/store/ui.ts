// 앱 UI 상태(세션) — 설정 창 열림과 보이는 칸 · 토큰 기록 판 열림(Tab 이 열고 닫는다). workbench store/ui.ts.
import { create } from "zustand";

export type SettingsSection = "paths" | "panels" | "screens" | "chart" | "shortcuts";

interface UiState {
    settingsOpen: boolean;
    /** 설정 창이 보이는 칸 — 닫아도 남아 다음에 열 때(칸을 정하지 않으면) 마지막으로 본 칸이 보인다. */
    settingsSection: SettingsSection;
    /** 연다 — 칸을 주면 그 칸으로(열려 있어도 칸을 바꾼다: ? = 단축키 칸). */
    openSettings: (section?: SettingsSection) => void;
    setSettingsSection: (section: SettingsSection) => void;
    closeSettings: () => void;
    tokenHistoryOpen: boolean;
    toggleTokenHistory: () => void;
    closeTokenHistory: () => void;
}

export const useUi = create<UiState>()((set) => ({
    settingsOpen: false,
    settingsSection: "paths",
    openSettings: (section) => set((st) => ({ settingsOpen: true, settingsSection: section ?? st.settingsSection })),
    setSettingsSection: (section) => set({ settingsSection: section }),
    closeSettings: () => set({ settingsOpen: false }),
    tokenHistoryOpen: false,
    toggleTokenHistory: () => set((st) => ({ tokenHistoryOpen: !st.tokenHistoryOpen })),
    closeTokenHistory: () => set({ tokenHistoryOpen: false }),
}));
