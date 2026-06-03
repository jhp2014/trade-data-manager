// ── Chart ──────────────────────────────────────────────────────────────────

/** 크로스헤어 이동 후 툴팁을 보여주기까지의 지연(ms). 과도한 리렌더 방지. */
export const CHART_HOVER_DELAY_MS = 200;

/**
 * a/d 로 종목을 빠르게 훑을 때 중간 종목 차트를 매번 긁지 않도록
 * 차트 fetch 파라미터에 거는 디바운스(ms). 선택/헤더는 즉시 반영.
 */
export const CHART_PARAMS_DEBOUNCE_MS = 200;

/** 테마 오버레이 차트에 그릴 수 있는 시리즈 최대 수. */
export const CHART_OVERLAY_MAX_SERIES = 15;

// ── 거래대금 단위 변환 ─────────────────────────────────────────────────────

/**
 * DB daily 거래대금 단위: 백만원 (1 = 1,000,000원).
 * 억 단위로 변환: value / AMOUNT_MIL_TO_EOK
 */
export const AMOUNT_MIL_TO_EOK = 100;

/**
 * DB minute 거래대금 단위: 원.
 * 억 단위로 변환: value / AMOUNT_KRW_TO_EOK
 */
export const AMOUNT_KRW_TO_EOK = 1e8;

// ── List ───────────────────────────────────────────────────────────────────

/** 덱 항목 초기 페이지 사이즈 (현재 클라이언트 전체 렌더 — 추후 페이지네이션 기준값). */
export const LIST_PAGE_SIZE = 100;

/**
 * PeerListModal row 에 항상 노출할 거래대금 누적 카운트 임계값(억 단위).
 * 배열 순서 = 표시 순서. 첫 값이 dot 색상 판정 기준(최소 임계값).
 */
export const PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK = [50, 70, 100] as const;
