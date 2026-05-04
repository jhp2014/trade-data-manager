import { create } from "zustand";

export type SidePanelKey = "favorite" | "note" | "alert" | "settings";

interface UiState {
  // 우측 사이드 패널이 열려있는지, 어떤 패널이 활성인지
  sidePanelOpen: boolean;
  activeSidePanel: SidePanelKey | null;

  toggleSidePanel: (key: SidePanelKey) => void;
  closeSidePanel: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidePanelOpen: false,
  activeSidePanel: null,

  toggleSidePanel: (key) => {
    const { activeSidePanel, sidePanelOpen } = get();
    // 같은 아이콘 다시 클릭 → 닫기
    if (sidePanelOpen && activeSidePanel === key) {
      set({ sidePanelOpen: false, activeSidePanel: null });
      return;
    }
    set({ sidePanelOpen: true, activeSidePanel: key });
  },

  closeSidePanel: () => set({ sidePanelOpen: false, activeSidePanel: null }),
}));
