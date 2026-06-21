export type ReviewRow = {
  reviewId: string;
  rowNumber: number;
  stockCode: string;
  stockName?: string;
  tradeDate: string;
  tradeTime: string;
  themeName?: string;
  themeId?: string;
  features: Record<string, string>;
  manual: Record<string, string>;
};

export type ManualSummary = {
  filledCount: number;
  totalCount: number;
  missingRequired: string[];
  preview: Record<string, string | null>;
};

export type ReviewPoint = {
  pointKey: string;
  tradeTime: string;
  rowNumber: number;
  reviewId: string;
  amountText?: string | null;
  manualSummary: ManualSummary;
  sourceRow: ReviewRow;
};

export type ReviewStockGroup = {
  groupKey: string;
  stockCode: string;
  stockName?: string;
  tradeDate: string;
  points: ReviewPoint[];
};

export type ReviewViewMode = "summary" | "minute" | "daily" | "overlay";

/** DB 모드 작업셋의 tradeDate 범위. null = 전체(범위 제한 없음). */
export type DbDateRange = { from: string; to: string } | null;

export type InitialReviewSelection = {
  selectedGroupIndex: number;
  selectedPointKey: string;
};
