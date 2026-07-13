// DI Symbol 토큰(api 컨벤션 동일). framework-free 엔진을 모듈 가장자리에서 주입.
export const LIVE_ENGINE = Symbol("LIVE_ENGINE");
// 공유 kiwoom — 엔진(폴링·트레일링)과 차트가 한 CredentialPool 을 공유해 클라이언트 레이트 페이싱이 전체 호출을 정합 관리.
export const KIWOOM = Symbol("KIWOOM");
// 실시간 차트 서비스(선택 종목 오늘 ChartBundle 조립).
export const LIVE_CHART = Symbol("LIVE_CHART");
// 실시간 뉴스(KIS 온디맨드, lazy — 첫 요청에서 createKis).
export const LIVE_NEWS = Symbol("LIVE_NEWS");
// 알람 설정 영속(watchlist+룰 JSON 파일).
export const ALERT_CONFIG = Symbol("ALERT_CONFIG");
// 알람 런타임(평가 파이프라인 + 발화 로그) — 엔진 틱에 결합.
export const ALERTS = Symbol("ALERTS");
