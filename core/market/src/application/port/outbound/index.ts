// Outbound(driven) 포트 — 애플리케이션이 *필요로 하는* 인터페이스. infra 어댑터가 구현한다.
// 데이터 제공(Provider) + 영속화(Repository). core 는 이 인터페이스만 알고 구현은 모른다.
export * from "./dailyCandleProvider.js";
export * from "./minuteCandleProvider.js";
export * from "./candleRepository.js";
