// 패널 크롬 상태 슬라이스 — 패널별 헤더 컨트롤 바 접힘(차트·보드 공용). 데이터가 아니라 표시 상태.
import type { StateCreator } from "zustand";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export interface PanelSlice {
    panelControlsCollapsed: Record<string, boolean>; // 패널별 컨트롤 바 접힘(true=접힘). 미저장 = 펼침.
    togglePanelControls: (panelId: string) => void;
}

// 패널별 컨트롤 접힘 — localStorage 영속(chartViews 선례). 화면(프리셋) 전환으로 remount 돼도 유지.
const CONTROLS_KEY = "wb.panelControlsCollapsed";

export const createPanelSlice: StateCreator<WorkbenchState, [], [], PanelSlice> = (set) => ({
    panelControlsCollapsed: loadJson(CONTROLS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, boolean>) : null)) ?? {},
    togglePanelControls: (panelId) =>
        set((s) => {
            const next = { ...s.panelControlsCollapsed, [panelId]: !s.panelControlsCollapsed[panelId] };
            saveJson(CONTROLS_KEY, next);
            return { panelControlsCollapsed: next };
        }),
});
