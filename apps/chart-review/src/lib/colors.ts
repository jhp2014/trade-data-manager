/**
 * data-view JS 차트/리스트가 직접 사용하는 색상 토큰.
 *
 * CSS 변수(src/app/globals.css의 --rise / --fall / --neutral)와 의미적으로 1:1
 * 매칭되지만, JS에서는 hex 리터럴이 필요하므로 여기서 단일 정의를 유지한다.
 * 시각적 미세 조정이 필요하면 이 파일과 globals.css를 함께 수정.
 *
 * - `RISE` / `FALL` / `NEUTRAL`은 등락 의미 색상 (리스트 mini chart 등)
 * - `OVERLAY_*`는 차트 오버레이 시리즈용
 * - `PRICE_LINE_PALETTE`는 가격 라인용 (해시 기반 라운드 로빈)
 */

/** 상승. CSS `--rise` 대응 */
export const RISE_COLOR = "#ef4444";
/** 하락. CSS `--fall` 대응 */
export const FALL_COLOR = "#3b82f6";
/** 보합/중립. CSS `--neutral` 대응 */
export const NEUTRAL_COLOR = "#8b95a1";
/** 리스트 mini-chart 등에 쓰는 보조 보더 */
export const BORDER_SUBTLE_COLOR = "#d1d6db";

/** 상승 반투명 채움 (거래대금 막대 등). RISE_COLOR(#ef4444)의 50% 알파. */
export const RISE_FILL = "rgba(239,68,68,0.5)";
/** 하락 반투명 채움. FALL_COLOR(#3b82f6)의 50% 알파. */
export const FALL_FILL = "rgba(59,130,246,0.5)";
/** 거래대금 막대 기본색(방향성 없음). */
export const AMOUNT_BAR_COLOR = "rgba(120,120,140,0.5)";

/** 오버레이 시리즈에서 자기 종목 색. */
export const OVERLAY_SELF_COLOR = "#000000";

/** 오버레이 시리즈 피어 팔레트 (라운드 로빈). */
export const OVERLAY_PEER_PALETTE = [
    "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
    "#fb7185", "#22d3ee", "#fde047", "#c084fc", "#4ade80",
] as const;

/** 가격 라인 팔레트 (해시 기반 매핑). */
export const PRICE_LINE_PALETTE = [
    "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#14b8a6",
    "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#ef4444",
] as const;
