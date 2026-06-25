/**
 * data-view JS 차트/리스트가 직접 사용하는 색상 토큰.
 *
 * 등락 의미 색상(RISE/FALL)·반투명 채움·거래대금 막대 색은 두 앱 공유라
 * `@trade-data-manager/chart-utils`에서 단일 정의하고 여기서 재노출한다.
 * 시각적 미세 조정이 필요하면 chart-utils/colors.ts와 globals.css를 함께 수정.
 *
 * 아래는 chart-review 전용 토큰:
 * - `NEUTRAL_COLOR` / `BORDER_SUBTLE_COLOR`: 리스트 mini chart 등
 * - `OVERLAY_*`: 차트 오버레이 시리즈용
 * - `PRICE_LINE_PALETTE`: 가격 라인용 (해시 기반 라운드 로빈)
 */

export {
    RISE_COLOR,
    FALL_COLOR,
    RISE_FILL,
    FALL_FILL,
    AMOUNT_BAR_COLOR,
} from "@trade-data-manager/chart-utils";

/** 보합/중립. CSS `--neutral` 대응 */
export const NEUTRAL_COLOR = "#8b95a1";
/** 리스트 mini-chart 등에 쓰는 보조 보더 */
export const BORDER_SUBTLE_COLOR = "#d1d6db";

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
