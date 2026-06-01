import type { ReviewPoint, ReviewStockGroup } from "@/types/review";

/** tradeTime 이 없는 종목은 09:00 을 기본값으로 사용. (빈 값이면 [time] 세그먼트가 비어 404 발생) */
export const DEFAULT_TRADE_TIME = "09:00";

export function buildReviewPath(group: ReviewStockGroup, point: ReviewPoint) {
  const time = point.tradeTime?.trim() || DEFAULT_TRADE_TIME;
  return `/review/${group.stockCode}/${group.tradeDate}/${time}`;
}
