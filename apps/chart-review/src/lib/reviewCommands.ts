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
  /** 임의 그룹 인덱스로 점프(필터 순회 목록과 무관). 첫 타점 선택 + URL 동기화. */
  goToGroup: (groupIndex: number) => void;
};

export function createReviewCommands(
  groups: ReviewStockGroup[],
  /**
   * 종목 이동(a/d, prev/next)이 순회할 그룹 인덱스 목록(오름차순).
   * 필터 활성 시 매칭 종목만 담아 넘긴다. 생략/빈 배열이면 전체 그룹을 순회.
   */
  navigableIndices?: number[],
): ReviewCommands {
  const order =
    navigableIndices && navigableIndices.length > 0
      ? navigableIndices
      : groups.map((_, i) => i);

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

  /** order 안에서 현재 그룹의 위치. 없으면(필터 밖) -1. */
  const positionOf = (groupIndex: number) => order.indexOf(groupIndex);

  const goToGroupIndex = (groupIndex: number) => {
    select(groupIndex, groups[groupIndex].points[0].pointKey);
  };

  return {
    nextGroup: () => {
      const { selectedGroupIndex } = useReviewStore.getState();
      const pos = positionOf(selectedGroupIndex);
      if (pos === -1) {
        // 현재 그룹이 순회 목록 밖(필터 적용 직후 등): 다음 매칭 종목으로.
        const after = order.find((i) => i > selectedGroupIndex);
        goToGroupIndex(after ?? order[order.length - 1]);
        return;
      }
      goToGroupIndex(order[Math.min(pos + 1, order.length - 1)]);
    },
    prevGroup: () => {
      const { selectedGroupIndex } = useReviewStore.getState();
      const pos = positionOf(selectedGroupIndex);
      if (pos === -1) {
        const before = [...order].reverse().find((i) => i < selectedGroupIndex);
        goToGroupIndex(before ?? order[0]);
        return;
      }
      goToGroupIndex(order[Math.max(pos - 1, 0)]);
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
    goToGroup: (groupIndex) => {
      if (groupIndex < 0 || groupIndex >= groups.length) return;
      goToGroupIndex(groupIndex);
    },
  };
}
