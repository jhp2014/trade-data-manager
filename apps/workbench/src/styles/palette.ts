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

/** 축 위 상대위치(frac 0약..1강) → 강약색. 시트 셀·타점 카드가 같은 3단계를 쓴다. */
export const heatOf = (frac: number): string => (frac >= 0.66 ? STRONG : frac >= 0.33 ? MID : WEAK);

// ── 순위 보드/시트 강조
export const FILTER = "#e24b4a"; // 필터 밴드 경계(우클릭 지정) · 필터 걸린 열 헤더
export const ACTIVE = "#0ea5e9"; // 활성 타점 — 밝은 스카이블루(글로우로 대비)
export const ACTIVE_SOFT = "rgba(14,165,233,0.32)";
export const HOVER = "#f59e0b"; // 시트↔레일 링크 호버 — 앰버(활성 sky·필터 red 와 구분)
export const HOVER_SOFT = "rgba(245,158,11,0.28)";
export const PIN = "#8b5cf6"; // 핀 = 작업셋(보라) — 활성(블루)과 구분

// ── 태그(명목형 분류) — 이름의 `그룹:값` prefix 로 **자동 색**. 색을 손으로 관리하지 않으면서
//    같은 그룹끼리 눈에 묶인다(팔레트가 20~30개로 늘면 텍스트만으론 못 따라감). prefix 없으면 무채색.
//    고른 색들은 의미색과 겹치지 않게 — 순수 빨강(FILTER)·스카이(ACTIVE)는 뺐다.
//    그룹은 첫 `:` 앞을 **공백 다듬어** 자른다 — 안 그러면 "형태:돌파" 와 "형태 :돌파" 가 다른 색이 된다.
const TAG_GROUP_COLORS = ["#7c9c3f", "#b8792e", "#3f8f8a", "#8b5cf6", "#c0567e", "#4a7fc1", "#a5883a", "#5f9e6b"];
export const TAG_PLAIN = "#8b93a7"; // 그룹 없는 태그

/** 이름의 그룹 부분(첫 `:` 앞, 공백 다듬음). 그룹이 없으면 null. */
export function tagGroupOf(name: string): string | null {
    const i = name.indexOf(":");
    if (i < 0) return null;
    const g = name.slice(0, i).trim();
    return g.length > 0 ? g : null;
}

/** 이름의 값 부분(첫 `:` 뒤, 공백 다듬음). 그룹이 없으면 이름 그대로 — 좁은 자리 표기용. */
export function tagValueOf(name: string): string {
    const i = name.indexOf(":");
    if (i < 0) return name;
    return name.slice(i + 1).trim() || name;
}

export function tagColor(name: string): string {
    const group = tagGroupOf(name);
    if (group === null) return TAG_PLAIN;
    let h = 0;
    for (let k = 0; k < group.length; k++) h = (h * 31 + group.charCodeAt(k)) >>> 0;
    return TAG_GROUP_COLORS[h % TAG_GROUP_COLORS.length];
}

// ── 차트
export const DRIFT = "#e07b1a"; // 검색날짜 드리프트(기준일과 다른 날을 보는 중)
export const MARKER_NOW = "#111827"; // 분봉 시간선 ▼ — "지금 여기" 표식. 저장 타점 ▼(흰/회색)와 색으로 갈린다
export const ALARM = "#dc2626"; // 알람 가격 조건선
export const PRICE_LINE = "#16796f"; // 사용자가 그은 가격선(D/M)
export const GUIDE = "#7c3aed"; // +30% 가이드선(그 세션 상한가 위치) — 고가마커 30%+ 와 같은 보라
export const IGNORED_CANDLE = "#6b7280"; // 무시 캔들 마커 — 회색이 고가 등락률 tier 색을 덮는다(그 숫자가 오염된 고가의 산물이라)
// 골격 피벗(형태 분류 입력) — 일봉 차트 위 색상환에서 **가장 넓게 비어 있는 구간**(황록 ~80°)을 쓴다.
// 이미 찬 자리: 0° 빨강(상승봉·고가마커 25%+·알람) · 25° 주황(고가마커 20%·검색세로선) · 45° 앰버(고가마커 15%)
//              172° 청록(가격선) · 200° 하늘(기준선) · 217° 파랑(하락봉) · 271° 보라(고가마커 30%+·가이드선).
// 옛 마젠타(292°)는 그 보라 둘과 이웃이라 겹쳐 보였다. 마커도 원이 아니라 **X** 로 그려 고가·무시 마커(원)와
// 모양으로도 갈린다 — 색만으로 가르면 작은 크기에서 결국 섞인다.
export const SKELETON = "#65a30d";
export const CHART_LABEL = "#a0a0a0"; // 차트 툴팁의 라벨 회색(툴팁 배경 위 — 본문 --text-tertiary 와 다름)
export const CHART_VALUE = "#d4d4d8"; // 차트 툴팁의 값 회색(라벨보다 밝게)
