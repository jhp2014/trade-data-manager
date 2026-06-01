import type { ReviewPoint, ReviewStockGroup } from "@/types/review";

export function buildReviewPath(group: ReviewStockGroup, point: ReviewPoint) {
  return `/review/${group.stockCode}/${group.tradeDate}/${point.tradeTime}`;
}
