import type { InitialReviewSelection, ReviewStockGroup } from "@/types/review";

export type ReviewSeed = {
  stockCode: string;
  tradeDate: string;
  tradeTime: string;
};

export function resolveInitialSelection(
  groups: ReviewStockGroup[],
  seed: ReviewSeed,
): InitialReviewSelection {
  const groupIndex = groups.findIndex(
    (group) => group.stockCode === seed.stockCode && group.tradeDate === seed.tradeDate,
  );
  const selectedGroupIndex = groupIndex >= 0 ? groupIndex : 0;
  const selectedGroup = groups[selectedGroupIndex];
  const point =
    selectedGroup.points.find((candidate) => candidate.tradeTime === seed.tradeTime) ??
    selectedGroup.points[0];

  return {
    selectedGroupIndex,
    selectedPointKey: point.pointKey,
  };
}
