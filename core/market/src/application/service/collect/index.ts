// collect 슬라이스(공개 표면) — 복기 데이터 수집 유스케이스.
// 공개 진입: MarketDataCollectService(inbound 포트 MarketDataCollector 구현).
// 내부 협력자(DailyCollector·MinuteCollector·Sweep·Ingest)는 src/internal.ts 로 분리
//   → @trade-data-manager/market/internal (조합 루트 apps/ingest 만 소비).
export * from "./marketDataCollectService.js";
