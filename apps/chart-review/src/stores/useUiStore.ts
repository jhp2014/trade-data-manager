"use client";

import { create } from "zustand";

export type ChartPriceMode = "krx" | "nxt";

type UiState = {
  chartPriceMode: ChartPriceMode;
  setChartPriceMode: (mode: ChartPriceMode) => void;
};

export const useUiStore = create<UiState>()((set) => ({
  chartPriceMode: "krx",
  setChartPriceMode: (mode) => set({ chartPriceMode: mode }),
}));
