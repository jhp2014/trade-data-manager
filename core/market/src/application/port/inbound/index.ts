// Inbound(driving) 포트 — 공개 유스케이스 2개(CQRS): collect(쓰기) / preview(읽기).
// 내부 협력 서비스(단일종목 ingest·유니버스·분봉 sweep)는 포트가 아니라 service 의 내부 계약이다.
export * from "./marketDataCollector.js";
export * from "./candidateQuery.js";
