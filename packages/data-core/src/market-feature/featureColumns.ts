/**
 * minute_candle_features 에서 read/export 시 투영하는 피처 컬럼 목록(순서 포함).
 * - data-core 의 feature 투영(buildFeaturesByKey)이 "어떤 컬럼을 읽을지"의 단일 출처.
 * - Sheet export 의 피처 컬럼 순서도 이 목록을 그대로 따른다(앱이 import).
 * raw(원시) 컬럼은 의도적으로 제외한 curated 목록이다.
 */
export const FEATURE_COLUMNS = [
    "closeRateKrx",
    "closeRateNxt",
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
