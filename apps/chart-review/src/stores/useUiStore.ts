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

  /**
   * m_ 값 필터. key(접두사 없는 원본 m_ 키) → 허용 값 목록.
   * 값이 1개 이상 선택된 키만 조건으로 적용한다(키 간 AND, 같은 키 값 간 OR).
   */
  manualFilters: Record<string, string[]>;
  toggleManualFilterValue: (key: string, value: string) => void;
  clearManualFilters: () => void;
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

      manualFilters: {},
      toggleManualFilterValue: (key, value) =>
        set((state) => {
          const next = toggleInList(state.manualFilters[key] ?? [], value);
          const manualFilters = { ...state.manualFilters };
          if (next.length === 0) delete manualFilters[key];
          else manualFilters[key] = next;
          return { manualFilters };
        }),
      clearManualFilters: () => set({ manualFilters: {} }),
    }),
    {
      name: "chart-review-ui",
      partialize: (state) => ({
        chartPriceMode: state.chartPriceMode,
        headerFieldKeys: state.headerFieldKeys,
        pointFieldKeys: state.pointFieldKeys,
        manualFilters: state.manualFilters,
      }),
    },
  ),
);
