"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChartPriceMode = "krx" | "nxt";

type UiState = {
  chartPriceMode: ChartPriceMode;
  setChartPriceMode: (mode: ChartPriceMode) => void;

  /** 헤더 종목명 아래 작게 노출할 필드 키(m_/feature). 선택 순서 유지. */
  headerFieldKeys: string[];
  toggleHeaderField: (key: string) => void;
  clearHeaderFields: () => void;

  /** Point List 카드에 노출할 m_ 필드 키. 선택 순서 유지. */
  pointFieldKeys: string[];
  togglePointField: (key: string) => void;
  clearPointFields: () => void;
};

function toggleInList(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      chartPriceMode: "krx",
      setChartPriceMode: (mode) => set({ chartPriceMode: mode }),

      headerFieldKeys: [],
      toggleHeaderField: (key) =>
        set((state) => ({ headerFieldKeys: toggleInList(state.headerFieldKeys, key) })),
      clearHeaderFields: () => set({ headerFieldKeys: [] }),

      pointFieldKeys: [],
      togglePointField: (key) =>
        set((state) => ({ pointFieldKeys: toggleInList(state.pointFieldKeys, key) })),
      clearPointFields: () => set({ pointFieldKeys: [] }),
    }),
    {
      name: "chart-review-ui",
      partialize: (state) => ({
        chartPriceMode: state.chartPriceMode,
        headerFieldKeys: state.headerFieldKeys,
        pointFieldKeys: state.pointFieldKeys,
      }),
    },
  ),
);
