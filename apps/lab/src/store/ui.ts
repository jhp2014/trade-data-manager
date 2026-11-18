// 앱 UI 상태(세션) — 설정 창 열림과 보이는 칸 · 기록 판(토큰 기록 / 탐색 기록 — Tab 이 넘긴다). workbench store/ui.ts.
import { create } from "zustand";

export type SettingsSection = "paths" | "panels" | "screens" | "chart" | "shortcuts";
/** 기록 판의 화면 — 토큰 기록(붙여넣은 토큰) / 탐색 기록(본 종목·날짜). */
export type HistoryView = "token" | "visit";
const HISTORY_CYCLE: (HistoryView | null)[] = [null, "token", "visit"];

interface UiState {
    settingsOpen: boolean;
    /** 설정 창이 보이는 칸 — 닫아도 남아 다음에 열 때(칸을 정하지 않으면) 마지막으로 본 칸이 보인다. */
    settingsSection: SettingsSection;
    /** 연다 — 칸을 주면 그 칸으로(열려 있어도 칸을 바꾼다: ? = 단축키 칸). */
    openSettings: (section?: SettingsSection) => void;
    setSettingsSection: (section: SettingsSection) => void;
    closeSettings: () => void;
    /** 기록 판에 보이는 화면 — null = 닫힘. */
    historyView: HistoryView | null;
    /** Tab — 닫힘 → 토큰 기록 → 탐색 기록 → 닫힘. */
    cycleHistory: () => void;
    /** 경로 줄 「기록」 버튼 — 닫혀 있으면 토큰 기록, 열려 있으면 닫는다. */
    toggleHistory: () => void;
    /** 판 머리의 화면 이름을 눌러 바꾸기. */
    setHistoryView: (view: HistoryView) => void;
    closeHistory: () => void;
}

export const useUi = create<UiState>()((set) => ({
    settingsOpen: false,
    settingsSection: "paths",
    openSettings: (section) => set((st) => ({ settingsOpen: true, settingsSection: section ?? st.settingsSection })),
    setSettingsSection: (section) => set({ settingsSection: section }),
    closeSettings: () => set({ settingsOpen: false }),
    historyView: null,
    cycleHistory: () => set((st) => ({ historyView: HISTORY_CYCLE[(HISTORY_CYCLE.indexOf(st.historyView) + 1) % HISTORY_CYCLE.length] })),
    toggleHistory: () => set((st) => ({ historyView: st.historyView === null ? "token" : null })),
    setHistoryView: (view) => set({ historyView: view }),
    closeHistory: () => set({ historyView: null }),
}));
