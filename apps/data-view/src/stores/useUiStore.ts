import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidePanelKey = "favorite" | "note" | "alert" | "settings";
export type ChartPriceMode = "krx" | "nxt";

interface UiState {
  sidePanelOpen: boolean;
  activeSidePanel: SidePanelKey | null;
  chartPriceMode: ChartPriceMode;

  toggleSidePanel: (key: SidePanelKey) => void;
  closeSidePanel: () => void;
  setChartPriceMode: (mode: ChartPriceMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidePanelOpen: false,
      activeSidePanel: null,
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
        chartPriceMode: state.chartPriceMode,
      }),
    },
  ),
);
