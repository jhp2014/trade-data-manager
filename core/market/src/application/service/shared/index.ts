// shared 슬라이스 — 여러 유스케이스가 공유하는 조각(slice 전용 아님).
// dailyRange:            기본 일봉 범위·seoulToday(collect ingest + marketcap backfill 공용).
// baselineLevelResolver: 그은 선 전부 → 가격. 축이 쓰는 하나를 고르는 baselineResolver 의 그림용 짝.
export * from "./dailyRange.js";
export * from "./baselineLevelResolver.js";
// baselineResolver: 그은 선들 중 축·격자가 쓸 **하나**를 고르는 공용 규칙(가격 최저·타이=좌표 최신).
// 자동 타점 격자(apps/api grid)가 기대집합 산정에 직접 쓰므로 패키지 밖으로 낸다.
export * from "./baselineResolver.js";
