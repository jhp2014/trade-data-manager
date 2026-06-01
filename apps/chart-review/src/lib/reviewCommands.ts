"use client";

import type { ReviewStockGroup, ReviewViewMode } from "@/types/review";
import { buildReviewPath } from "@/lib/url";
import { useReviewStore } from "@/stores/useReviewStore";

export type ReviewCommands = {
  nextGroup: () => void;
  prevGroup: () => void;
  nextPoint: () => void;
  prevPoint: () => void;
  selectPoint: (pointKey: string) => void;
  setViewMode: (mode: ReviewViewMode) => void;
};

export function createReviewCommands(groups: ReviewStockGroup[]): ReviewCommands {
  const mirrorUrl = (groupIndex: number, pointKey: string) => {
    const group = groups[groupIndex];
    const point = group.points.find((candidate) => candidate.pointKey === pointKey) ?? group.points[0];
    window.history.replaceState(null, "", buildReviewPath(group, point));
  };

  const select = (groupIndex: number, pointKey: string) => {
    const store = useReviewStore.getState();
    store.setSelectedGroupIndex(groupIndex);
    store.setSelectedPointKey(pointKey);
    mirrorUrl(groupIndex, pointKey);
  };

  return {
    nextGroup: () => {
      const { selectedGroupIndex } = useReviewStore.getState();
      const nextIndex = Math.min(selectedGroupIndex + 1, groups.length - 1);
      const pointKey = groups[nextIndex].points[0].pointKey;
      select(nextIndex, pointKey);
    },
    prevGroup: () => {
      const { selectedGroupIndex } = useReviewStore.getState();
      const nextIndex = Math.max(selectedGroupIndex - 1, 0);
      const pointKey = groups[nextIndex].points[0].pointKey;
      select(nextIndex, pointKey);
    },
    nextPoint: () => {
      const { selectedGroupIndex, selectedPointKey } = useReviewStore.getState();
      const group = groups[selectedGroupIndex];
      const currentIndex = group.points.findIndex((point) => point.pointKey === selectedPointKey);
      const nextIndex = Math.min(currentIndex + 1, group.points.length - 1);
      select(selectedGroupIndex, group.points[nextIndex].pointKey);
    },
    prevPoint: () => {
      const { selectedGroupIndex, selectedPointKey } = useReviewStore.getState();
      const group = groups[selectedGroupIndex];
      const currentIndex = group.points.findIndex((point) => point.pointKey === selectedPointKey);
      const nextIndex = Math.max(currentIndex - 1, 0);
      select(selectedGroupIndex, group.points[nextIndex].pointKey);
    },
    selectPoint: (pointKey) => {
      const { selectedGroupIndex } = useReviewStore.getState();
      select(selectedGroupIndex, pointKey);
    },
    setViewMode: (mode) => useReviewStore.getState().setViewMode(mode),
  };
}
