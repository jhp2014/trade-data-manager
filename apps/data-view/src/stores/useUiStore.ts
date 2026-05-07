import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidePanelKey = "favorite" | "note" | "alert" | "settings";

interface UiState {
  sidePanelOpen: boolean;
  activeSidePanel: SidePanelKey | null;
  visibleOptionKeys: string[];

  toggleSidePanel: (key: SidePanelKey) => void;
  closeSidePanel: () => void;
  setVisibleOptionKeys: (keys: string[]) => void;
  toggleOptionKey: (key: string) => void;
  initVisibleOptionKeysIfEmpty: (allKeys: string[]) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidePanelOpen: false,
      activeSidePanel: null,
      visibleOptionKeys: [],

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
    }),
    {
      name: "data-view-ui",
      partialize: (state) => ({ visibleOptionKeys: state.visibleOptionKeys }),
    },
  ),
);
