// 패널별 뷰/토글 상태 슬라이스 — 헤더 토글류를 패널 단위로 보관·영속한다.
// 로컬 useState 로 두면 프리셋 전환(dockview fromJSON = 패널 재마운트)에 리셋되는 문제를 없앤다.
// chartViews·panelControlsCollapsed(패널별 store 맵) 선례의 일반화: 임의 key 를 담는 한 벌.
import type { StateCreator } from "zustand";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export type PanelUiBag = Record<string, Record<string, unknown>>; // panelId → { key: value }

export interface PanelUiSlice {
    panelUi: PanelUiBag; // 패널별 토글/뷰 상태. localStorage 영속 — 프리셋 전환·새로고침에 유지.
    setPanelUi: (panelId: string, key: string, value: unknown) => void;
}

const PANEL_UI_KEY = "wb.panelUi";

export const createPanelUiSlice: StateCreator<WorkbenchState, [], [], PanelUiSlice> = (set) => ({
    panelUi: loadJson(PANEL_UI_KEY, (o) => (o && typeof o === "object" ? (o as PanelUiBag) : null)) ?? {},
    setPanelUi: (panelId, key, value) =>
        set((s) => {
            const panel = { ...(s.panelUi[panelId] ?? {}), [key]: value };
            const next = { ...s.panelUi, [panelId]: panel };
            saveJson(PANEL_UI_KEY, next);
            return { panelUi: next };
        }),
});
