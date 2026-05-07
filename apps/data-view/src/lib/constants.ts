// ── Chart ──────────────────────────────────────────────────────────────────

/** 크로스헤어 이동 후 툴팁을 보여주기까지의 지연(ms). 과도한 리렌더 방지. */
export const CHART_HOVER_DELAY_MS = 200;

/** 테마 오버레이 차트에 그릴 수 있는 시리즈 최대 수. */
export const CHART_OVERLAY_MAX_SERIES = 15;

/** 봉 위 고가 마커를 표시하기 시작하는 전일비 % 최솟값 (이 미만은 마커 없음). */
export const HIGH_MARKER_MIN_PCT = 10;

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
