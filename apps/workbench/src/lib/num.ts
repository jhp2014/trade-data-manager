// 수 다루기 공용(순수) — 그리기 코드가 좌표를 상자 안에 가두거나 무리의 한복판을 찾을 때.
//
// 전부 한 줄짜리라 파일마다 다시 쓰기 쉬웠고 실제로 그랬다. 문제는 길이가 아니라 **가장자리 처리가
// 갈렸다는 것**이다: 같은 이름의 `clamp01` 이 한쪽은 NaN 을 0.5 로 받아내고 다른 쪽은 NaN 을 그대로
// 흘려 `calc()` 안에서 무효 CSS 가 됐다. 한 벌로 모으면 그 가장자리가 한 번만 정해진다.

/** 값을 [lo, hi] 안으로. */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 0..1 프랙션으로. **유한하지 않으면 한가운데(0.5)** — 레일·라벨 좌표가 이걸 그대로 `calc()` 에 넣기
 * 때문이다. NaN 이 새면 그 선언 전체가 무효가 되어 요소가 엉뚱한 자리에 서거나 사라진다.
 * (도메인이 비어 척도가 0/0 이 되는 순간이 실제로 있다 — 값 없는 계산 축.)
 */
export const clamp01 = (f: number): number => (Number.isFinite(f) ? clamp(f, 0, 1) : 0.5);

/** 배열 인덱스를 [0, len-1] 안으로. 빈 배열이면 0(호출부가 존재 여부를 따로 본다). */
export const clampIndex = (i: number, len: number): number => (len <= 0 ? 0 : clamp(Math.round(i), 0, len - 1));

/**
 * 가운뎃값 — 무리의 한복판을 잡을 때(뱃지 자리 등). 평균이 아닌 이유는 이상치 하나가
 * 뱃지를 무리 밖으로 끌고 가기 때문. 빈 배열은 0.
 */
export const median = (v: readonly number[]): number =>
    v.length === 0 ? 0 : [...v].sort((a, b) => a - b)[v.length >> 1]!;
