import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidePanelKey = "favorite" | "note" | "alert" | "settings";
export type ChartPriceMode = "krx" | "nxt";

interface UiState {
  sidePanelOpen: boolean;
  activeSidePanel: SidePanelKey | null;
  visibleOptionKeys: string[];
  chartPriceMode: ChartPriceMode;

  toggleSidePanel: (key: SidePanelKey) => void;
  closeSidePanel: () => void;
  setVisibleOptionKeys: (keys: string[]) => void;
  toggleOptionKey: (key: string) => void;
  initVisibleOptionKeysIfEmpty: (allKeys: string[]) => void;
  setChartPriceMode: (mode: ChartPriceMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidePanelOpen: false,
      activeSidePanel: null,
      visibleOptionKeys: [],
      chartPriceMode: "krx" as ChartPriceMode,

      toggleSidePanel: (key) => {
        const { activeSidePanel, sidePanelOpen } = get();
        if (sidePanelOpen && activeSidePanel === key) {
          set({ sidePanelOpen: false, activeSidePanel: null });
          return;
        }
        set({ sidePanelOpen: true, activeSidePanel: key });
      },

      closeSidePanel: () => set({ sidePanelOpen: false, activeSidePanel: null }),

      setVisibleOptionKeys: (keys) => set({ visibleOptionKeys: keys }),

      toggleOptionKey: (key) => {
        const { visibleOptionKeys } = get();
        if (visibleOptionKeys.includes(key)) {
          set({ visibleOptionKeys: visibleOptionKeys.filter((k) => k !== key) });
        } else {
          set({ visibleOptionKeys: [...visibleOptionKeys, key] });
        }
      },

      initVisibleOptionKeysIfEmpty: (allKeys) => {
        const { visibleOptionKeys } = get();
        if (visibleOptionKeys.length > 0) return;
        const initial = allKeys.length <= 3 ? allKeys : allKeys.slice(0, 3);
        set({ visibleOptionKeys: initial });
      },

      setChartPriceMode: (mode) => set({ chartPriceMode: mode }),
    }),
    {
      name: "data-view-ui",
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2 && persisted?.dailyChartPriceMode) {
          persisted.chartPriceMode = persisted.dailyChartPriceMode;
          delete persisted.dailyChartPriceMode;
        }
        return persisted;
      },
      partialize: (state) => ({
        visibleOptionKeys: state.visibleOptionKeys,
        chartPriceMode: state.chartPriceMode,
      }),
    },
  ),
);
