export const FIXED_COLUMNS = [
    "reviewId",
    "stockCode",
    "stockName",
    "tradeDate",
    "tradeTime",
    "lineTargets",
] as const;

export const FEATURE_COLUMNS = [
    "changeRate5m",
    "changeRate10m",
    "changeRate30m",
    "changeRate60m",
    "changeRate120m",
    "dayHighRate",
    "dayHighTime",
    "pullbackFromDayHigh",
    "minutesSinceDayHigh",
    "tradingAmount",
    "cumulativeTradingAmount",
    "cnt20Amt",
    "cnt30Amt",
    "cnt40Amt",
    "cnt50Amt",
    "cnt60Amt",
    "cnt70Amt",
    "cnt80Amt",
    "cnt90Amt",
    "cnt100Amt",
    "cnt120Amt",
    "cnt140Amt",
    "cnt160Amt",
    "cnt180Amt",
    "cnt200Amt",
    "cnt250Amt",
    "cnt300Amt",
] as const;

export function toManualHeader(key: string): string {
    return `m_${key.replace(/^_+/, "")}`;
}
