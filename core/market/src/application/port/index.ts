// 포트 = 헥사고날 경계. CQRS 로 두 갈래:
//   collect/ : 수집(커맨드). inbound(유스케이스) + outbound(provider·store) — app 이 조립하는 파이프라인.
//   query/   : 조회(앱 대면). in/out 구분 없음(읽기는 1:1 passthrough) — driven read + 큐레이션 쓰기 + 유지 중인 유스케이스.
export * from "./collect/index.js";
export * from "./query/index.js";
