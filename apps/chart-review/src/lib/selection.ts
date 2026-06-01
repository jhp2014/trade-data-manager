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
  const seedTradeTime = normalizeSeedTime(seed.tradeTime);
  const groupIndex = groups.findIndex(
    (group) => group.stockCode === seed.stockCode && group.tradeDate === seed.tradeDate,
  );
  const selectedGroupIndex = groupIndex >= 0 ? groupIndex : 0;
  const selectedGroup = groups[selectedGroupIndex];
  const point =
    selectedGroup.points.find((candidate) => normalizeSeedTime(candidate.tradeTime) === seedTradeTime) ??
    selectedGroup.points[0];

  return {
    selectedGroupIndex,
    selectedPointKey: point.pointKey,
  };
}

function normalizeSeedTime(value: string) {
  const decoded = decodeURIComponent(value);
  const time = decoded.length === 8 && decoded.endsWith(":00") ? decoded.slice(0, 5) : decoded;
  return time;
}
