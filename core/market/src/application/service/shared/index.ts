// shared 슬라이스 — 여러 유스케이스가 공유하는 조각(slice 전용 아님).
// dailyRange:            기본 일봉 범위·seoulToday(collect ingest + marketcap backfill 공용).
// baselineLevelResolver: 그은 선 전부 → 가격. 축이 쓰는 하나를 고르는 baselineResolver 의 그림용 짝.
export * from "./dailyRange.js";
export * from "./baselineLevelResolver.js";
