"use client";

import { create } from "zustand";
import type { ReviewViewMode } from "@/types/review";

/** 사이드바 테마 리스트에서 다른 종목을 클릭해 차트만 임시로 탐색할 때의 대상. */
export type ChartOverride = {
  stockCode: string;
  tradeDate: string;
  stockName?: string;
};

/** 최근 탐색한 리뷰 종목(그룹) 기록 항목. */
export type HistoryEntry = {
  stockCode: string;
  tradeDate: string;
  stockName?: string;
  /** 같은 거래일의 Point List(review_target, ≥1 point) 보유 종목이면 true. 배지용. */
  hasReview?: boolean;
};

const HISTORY_LIMIT = 30;

type ReviewStoreState = {
  selectedGroupIndex: number;
  selectedPointKey: string | null;
  viewMode: ReviewViewMode;
  /** null 이면 선택된 리뷰 종목(그룹) 차트를 그대로 본다. */
  chartOverride: ChartOverride | null;
  /** 최근 탐색 순서(MRU). 맨 앞이 가장 최근(=현재 차트). */
  history: HistoryEntry[];
  hydrateSelection: (selection: { selectedGroupIndex: number; selectedPointKey: string }) => void;
  setSelectedGroupIndex: (index: number) => void;
  setSelectedPointKey: (pointKey: string) => void;
  setViewMode: (mode: ReviewViewMode) => void;
  setChartOverride: (override: ChartOverride | null) => void;
  /** 같은 (code,date) 가 있으면 제거 후 맨 앞으로 올린다(MRU). */
  pushHistory: (entry: HistoryEntry) => void;
};

export const useReviewStore = create<ReviewStoreState>()((set) => ({
  selectedGroupIndex: 0,
  selectedPointKey: null,
  viewMode: "summary",
  chartOverride: null,
  history: [],

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

  pushHistory: (entry) =>
    set((state) => {
      const top = state.history[0];
      // 이미 최상단이 같은 항목이면 변화 없음(불필요한 리렌더 방지).
      if (top && top.stockCode === entry.stockCode && top.tradeDate === entry.tradeDate) {
        return state;
      }
      const rest = state.history.filter(
        (h) => !(h.stockCode === entry.stockCode && h.tradeDate === entry.tradeDate),
      );
      return { history: [entry, ...rest].slice(0, HISTORY_LIMIT) };
    }),
}));
