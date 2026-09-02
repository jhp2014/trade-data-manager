// marketcap 슬라이스(공개 표면) — 일별 종목 속성(시총·상장주식수·소속부) + 공모가.
// 공개 진입: DailyStatCollectService(KRX 날짜 fan-out — 백필과 당일이 같은 진입점) ·
//   IpoPriceEnrichService(유니버스 공모가 enrichment).
// 내부 협력자(단일종목 fan-out: IpoPriceBackfillService)는 src/internal.ts 로 분리
//   → @trade-data-manager/market/internal.
// (발행주식수 역산 경로는 2026-09-02 폐기 — decisions.md 「시가총액·상장주식수 소스 (KRX)」)
export * from "./ipoPriceEnrichService.js";
export * from "./dailyStatCollectService.js";
