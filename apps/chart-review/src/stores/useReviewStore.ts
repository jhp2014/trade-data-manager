"use client";

import { create } from "zustand";
import type { ReviewViewMode } from "@/types/review";

type ReviewStoreState = {
  selectedGroupIndex: number;
  selectedPointKey: string | null;
  viewMode: ReviewViewMode;
  hydrateSelection: (selection: { selectedGroupIndex: number; selectedPointKey: string }) => void;
  setSelectedGroupIndex: (index: number) => void;
  setSelectedPointKey: (pointKey: string) => void;
  setViewMode: (mode: ReviewViewMode) => void;
};

export const useReviewStore = create<ReviewStoreState>()((set) => ({
  selectedGroupIndex: 0,
  selectedPointKey: null,
  viewMode: "summary",

  hydrateSelection: (selection) =>
    set({
      selectedGroupIndex: selection.selectedGroupIndex,
      selectedPointKey: selection.selectedPointKey,
      viewMode: "summary",
    }),

  setSelectedGroupIndex: (index) => set({ selectedGroupIndex: index }),
  setSelectedPointKey: (pointKey) => set({ selectedPointKey: pointKey }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
