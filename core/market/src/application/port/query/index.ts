// 조회(앱 대면) 포트 — in/out 구분 없음(읽기 1:1 passthrough). apps/api(HTTP)가 가장자리.
//   driven read (persistence 구현): candle·minute·rawDaily·marketCap·master·news reader + universe·theme provider
//   큐레이션 (앱 대면, Reader/Store 분리): dailyIssue · priceLine · reviewPoint
//   조립 유스케이스 (core 서비스가 구현): chartAnnotation(주석 zip) · newsSearcher(멀티채널 fan-out)
// (당일 요약 읽기모델 DaySummary/DailySnapshot 은 특정 화면 전용이라 apps/api 로 이관 — core 는 도메인만 제공.)
export * from "./candleReader.js";
export * from "./minuteReader.js";
export * from "./rawDailyReader.js";
export * from "./marketCapReader.js";
export * from "./masterReader.js";
export * from "./newsReader.js";
export * from "./dailyUniverseProvider.js";
export * from "./themeMembershipProvider.js";
export * from "./newsChannelSearch.js";
export * from "./dailyIssue.js";
export * from "./priceLine.js";
export * from "./reviewPoint.js";
export * from "./chartAnnotationReader.js";
export * from "./newsSearcher.js";
