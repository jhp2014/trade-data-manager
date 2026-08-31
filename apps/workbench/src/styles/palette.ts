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

/**
 * 트레이드 결과(자유 문자열) → 강약색. outcome 은 정해진 코드가 아니라 사람이 적는 말이라
 * **표기 흔들림을 여기 한 곳에서 흡수한다**(시트 셀·골격 겹쳐 그리기가 같은 규칙을 봐야 색이 안 갈린다).
 * 못 알아본 값은 중립 — 새 표기를 실패로 오인해 색칠하는 것보다 색이 없는 편이 정직하다.
 */
export function outcomeColor(v?: string): string {
    if (!v) return "var(--text-tertiary)";
    if (/성공|승|익절|win|good/i.test(v)) return STRONG;
    if (/실패|패|손절|loss|bad/i.test(v)) return FAIL;
    return "var(--text-secondary)";
}

// ── 순위 보드/시트 강조
export const FILTER = "#e24b4a"; // 필터 밴드 경계(우클릭 지정) · 필터 걸린 열 헤더
export const ACTIVE = "#0ea5e9"; // 활성 타점 — 밝은 스카이블루(글로우로 대비)
export const ACTIVE_SOFT = "rgba(14,165,233,0.32)";
export const HOVER = "#f59e0b"; // 시트↔레일 링크 호버 — 앰버(활성 sky·필터 red 와 구분)
export const HOVER_SOFT = "rgba(245,158,11,0.28)";
export const PIN = "#8b5cf6"; // 핀 = 작업셋(보라) — 활성(블루)과 구분

// ── 그룹(명목형 분류) — 이름의 `그룹:값` prefix 로 **자동 색**. 색을 손으로 관리하지 않으면서
//    같은 그룹끼리 눈에 묶인다(팔레트가 20~30개로 늘면 텍스트만으론 못 따라감). prefix 없으면 무채색.
//    고른 색들은 의미색과 겹치지 않게 — 순수 빨강(FILTER)·스카이(ACTIVE)는 뺐다.
//    그룹은 첫 `:` 앞을 **공백 다듬어** 자른다 — 안 그러면 "형태:돌파" 와 "형태 :돌파" 가 다른 색이 된다.
const TAG_GROUP_COLORS = ["#7c9c3f", "#b8792e", "#3f8f8a", "#8b5cf6", "#c0567e", "#4a7fc1", "#a5883a", "#5f9e6b"];
export const GROUP_PLAIN = "#8b93a7"; // 그룹 없는 그룹

/** 이름의 그룹 부분(첫 `:` 앞, 공백 다듬음). 그룹이 없으면 null. */
export function groupPrefixOf(name: string): string | null {
    const i = name.indexOf(":");
    if (i < 0) return null;
    const g = name.slice(0, i).trim();
    return g.length > 0 ? g : null;
}

/** 이름의 값 부분(첫 `:` 뒤, 공백 다듬음). 그룹이 없으면 이름 그대로 — 좁은 자리 표기용. */
export function groupValueOf(name: string): string {
    const i = name.indexOf(":");
    if (i < 0) return name;
    return name.slice(i + 1).trim() || name;
}

export function groupColor(name: string): string {
    const group = groupPrefixOf(name);
    if (group === null) return GROUP_PLAIN;
    let h = 0;
    for (let k = 0; k < group.length; k++) h = (h * 31 + group.charCodeAt(k)) >>> 0;
    return TAG_GROUP_COLORS[h % TAG_GROUP_COLORS.length];
}

/**
 * 계열 색 — **한 무리 안에서 서로 구분만 되면 되는** 색들(뜻은 없다). 뭉친 골격 라벨을 펼칠 때
 * 멤버마다 하나씩 돌려써서, 그림의 선과 목록의 행이 색으로 짝지어진다.
 * 그룹 색(TAG_GROUP_COLORS)과 값이 겹쳐도 **따로 둔다** — 저긴 이름에서 색이 결정론적으로 나와야 하고
 * 여긴 그저 순번이라, 한쪽을 손볼 때 다른 쪽이 딸려 바뀌면 안 된다.
 * 의미색(ACTIVE 하늘·HOVER 앰버)은 뺐다 — 선택·호버와 섞이면 그 둘이 뜻을 잃는다.
 */
const SERIES_COLORS = ["#7c9c3f", "#b8792e", "#3f8f8a", "#8b5cf6", "#c0567e", "#4a7fc1", "#a5883a", "#5f9e6b", "#c2593f", "#7a6fd0"];

/** 순번 → 계열 색. 무리가 팔레트보다 크면 돌려쓴다(좁은 자리에 모인 것들이라 혼동이 적다). */
export const seriesColor = (i: number): string => SERIES_COLORS[((i % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];

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

// ── 테마 순위 패널(순위 평면)
export const THEME_PEER = "#16796f"; // 테마 동료 점 — PRICE_LINE 과 지금 같은 teal 이지만 뜻이 다르다(머리 규칙: 이름을 가른다)

export const AUTO_POINT = "#16796f"; // 자동 Point(격자 파생) 마커 ◇ — PRICE_LINE 과 지금 같은 teal 이지만 뜻이 다르다(머리 규칙: 이름을 가른다)

export const CHART_LABEL = "#a0a0a0"; // 차트 툴팁의 라벨 회색(툴팁 배경 위 — 본문 --text-tertiary 와 다름)
export const CHART_VALUE = "#d4d4d8"; // 차트 툴팁의 값 회색(라벨보다 밝게)

// ── 거래대금 강도(골격 선분) — **순차 램프**: 흐린 회자주 → 선명한 자홍.
//
// 무지개(hue 순환)를 안 쓴 이유: 빨강이 큰지 파랑이 큰지 정하는 관습이 없어 **순서가 안 읽히고**,
// 값이 비슷한 두 선분에 전혀 다른 색을 줘서 **없는 경계를 만든다**. 여기서 답해야 하는 질문은
// "어디가 더 터졌나"라 순서가 보이는 스케일이라야 한다.
//
// 한 색상(자홍) 안에서 **채도만** 올리는 램프인 것도 의도다. 명도를 끝까지 밀면 한쪽 끝이 어느 한
// 테마에서 배경에 묻는다(밝은 노랑은 흰 배경에서, 짙은 남색은 검은 배경에서). 세 정점의 명도를
// 중간대에 묶어 라이트·다크 둘 다에서 읽힌다.
//
// 자홍인 이유: 이 화면에 이미 찬 자리를 피한다 — ACTIVE 하늘 · HOVER 앰버 · PIN/GUIDE 보라 ·
// FAIL/ALARM 빨강 · PRICE_LINE 청록. 역할(선택·호버)은 글로우와 굵기가 지므로
// 이 색은 온전히 값의 몫이다.
const AMOUNT_RAMP: [number, number, number][] = [
    [133, 123, 129], // 0.0 — 거의 무채색(조용한 구간)
    [181, 72, 127], // 0.5
    [225, 29, 116], // 1.0 — 터진 구간
];

/** 강도 0..1 → 램프 색. 범위 밖은 끝점으로 클램프(정규화 실패를 색으로 지어내지 않게). */
export function amountColor(frac: number): string {
    const t = Math.max(0, Math.min(1, frac));
    const seg = t < 0.5 ? 0 : 1;
    const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const a = AMOUNT_RAMP[seg];
    const b = AMOUNT_RAMP[seg + 1];
    const mix = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * u);
    return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
