// 의미색 단일 출처 — theme.css 토큰으로 못 가는 색들.
//
// 왜 CSS 변수가 아니라 TS 상수인가: 이 앱은 스타일을 거의 전부 인라인 객체로 쓰고, 나머지 소비자는
// **CSS 변수를 못 받는 곳**이다 — 캔버스 fillStyle(rankHeatmapPrimitive) · SVG 프레젠테이션 속성
// (ExcursionScatter 의 fill/stroke) · lightweight-charts 옵션(createPriceLine·VertLines).
// 그래서 var(--x) 로 통일할 수가 없고, TS 상수 한 곳이 실제로 모두를 덮는다.
// (클래스 기반 스타일·전역 톤은 theme.css 가 계속 소유한다 — 여긴 그 밖의 것.)
//
// **값이 같아도 의미가 다르면 이름을 나눈다.** FAIL 과 FILTER 는 지금 같은 빨강이지만 하나는
// "결과가 실패", 하나는 "필터 경계"다. 한쪽만 바꾸고 싶은 날이 오면 이름이 갈려 있어야 한다.

// ── 분석 강약 스케일(rank) — 상승/하락(--rise/--fall, 한국 관례 빨강/파랑)과는 **다른 축**이다.
export const STRONG = "#1baf7a"; // 강함 · 성공 · 목표 도달
export const MID = "#f5a623"; // 중간
export const WEAK = "#eb6834"; // 약함
export const FAIL = "#e24b4a"; // 실패 · 손절

// ── 순위 보드/시트 강조
export const FILTER = "#e24b4a"; // 필터 밴드 경계(우클릭 지정) · 필터 걸린 열 헤더
export const ACTIVE = "#0ea5e9"; // 활성 타점 — 밝은 스카이블루(글로우로 대비)
export const ACTIVE_SOFT = "rgba(14,165,233,0.32)";
export const HOVER = "#f59e0b"; // 시트↔레일 링크 호버 — 앰버(활성 sky·필터 red 와 구분)
export const HOVER_SOFT = "rgba(245,158,11,0.28)";
export const PIN = "#8b5cf6"; // 핀 = 작업셋(보라) — 활성(블루)과 구분

// ── 차트
export const DRIFT = "#e07b1a"; // 검색날짜 드리프트(기준일과 다른 날을 보는 중)
export const ALARM = "#dc2626"; // 알람 가격 조건선
export const PRICE_LINE = "#16796f"; // 사용자가 그은 가격선(D/M)
export const CHART_LABEL = "#a0a0a0"; // 차트 툴팁의 라벨 회색(툴팁 배경 위 — 본문 --text-tertiary 와 다름)
export const CHART_VALUE = "#d4d4d8"; // 차트 툴팁의 값 회색(라벨보다 밝게)
