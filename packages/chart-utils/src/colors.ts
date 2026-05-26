/**
 * 두 앱이 공유하는 차트 마커 색상/임계값.
 *
 * - 일봉 high-rate marker
 * - 분봉 거래대금 marker
 *
 * 임계값(threshold)이 커질수록 강조되는 그라디언트로 시각적 일관성을 유지한다.
 */

/** 봉 위 고가 마커를 표시하기 시작하는 전일비 % 최솟값 (이 미만은 마커 없음). */
export const HIGH_MARKER_MIN_PCT = 10;

/** 표시 임계값(억). 오름차순 유지 필수. */
export const AMOUNT_MARKER_THRESHOLDS_EOK = [
    30, 40, 50, 60, 70, 80, 90, 100, 200, 300,
] as const;

/** 임계값(억) → 색상. amountMarker / highMarker 공통 그라디언트. */
function markerSeverityColor(value: number, thresholds: { mid: number; high: number; veryHigh: number; extreme: number }): string {
    if (value < thresholds.mid) return "#fbbf24";       // amber
    if (value < thresholds.high) return "#fb923c";      // orange
    if (value < thresholds.veryHigh) return "#ef4444";  // red
    if (value < thresholds.extreme) return "#a855f7";   // purple
    return "#7c3aed";                                    // deep purple
}

/** 일봉 고가 마커 색상 (전일비 %). 최소 임계 미만이면 null. */
export function highMarkerColor(pct: number): string | null {
    if (pct < HIGH_MARKER_MIN_PCT) return null;
    return markerSeverityColor(pct, { mid: 15, high: 20, veryHigh: 25, extreme: 30 });
}

/** 거래대금 마커 색상 (억 단위 threshold). */
export function amountMarkerColor(thresholdEok: number): string {
    return markerSeverityColor(thresholdEok, { mid: 50, high: 80, veryHigh: 100, extreme: 200 });
}
