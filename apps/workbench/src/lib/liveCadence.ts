// 실시간 refetch 간격(ms) — 실시간 차트·워치리스트·알람로그가 공유하는 단일 소스(옛 흩어진 5_000 통합).
// 서버 엔진 tick(apps/live LIVE_POLL_MS, 기본 3초)과 같은 리듬 — 조건검색/알람 판정 주기와 화면 갱신을 맞춘다.
// 시간 기반 델타(30초·1분 유입, engine signals.ts)는 폴 간격과 무관하게 정확 → 이 값은 UI/서버 부하만 좌우.
export const LIVE_CADENCE_MS = 3_000;
