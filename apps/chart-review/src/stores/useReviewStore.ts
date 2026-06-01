"use client";

import { create } from "zustand";
import type { ReviewViewMode } from "@/types/review";

/** 사이드바 테마 리스트에서 다른 종목을 클릭해 차트만 임시로 탐색할 때의 대상. */
export type ChartOverride = {
  stockCode: string;
  tradeDate: string;
  stockName?: string;
};

type ReviewStoreState = {
  selectedGroupIndex: number;
  selectedPointKey: string | null;
  viewMode: ReviewViewMode;
  /** null 이면 선택된 리뷰 종목(그룹) 차트를 그대로 본다. */
  chartOverride: ChartOverride | null;
  hydrateSelection: (selection: { selectedGroupIndex: number; selectedPointKey: string }) => void;
  setSelectedGroupIndex: (index: number) => void;
  setSelectedPointKey: (pointKey: string) => void;
  setViewMode: (mode: ReviewViewMode) => void;
  setChartOverride: (override: ChartOverride | null) => void;
};

export const useReviewStore = create<ReviewStoreState>()((set) => ({
  selectedGroupIndex: 0,
  selectedPointKey: null,
  viewMode: "summary",
  chartOverride: null,

  hydrateSelection: (selection) =>
    set({
      selectedGroupIndex: selection.selectedGroupIndex,
      selectedPointKey: selection.selectedPointKey,
      viewMode: "summary",
      chartOverride: null,
    }),

  // 리뷰 대상(그룹/타점)을 바꾸면 임시 탐색은 항상 해제한다.
  setSelectedGroupIndex: (index) => set({ selectedGroupIndex: index, chartOverride: null }),
  setSelectedPointKey: (pointKey) => set({ selectedPointKey: pointKey, chartOverride: null }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setChartOverride: (override) => set({ chartOverride: override }),
}));
