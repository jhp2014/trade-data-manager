/**
 * 분봉 캔들의 거래대금(KRW)을 기반으로 임계 마커를 결정한다.
 *
 * 규칙:
 *  - amount(원) ÷ 1억 ≥ threshold 면 해당 threshold 후보
 *  - 여러 후보 중 가장 큰 threshold 하나만 표시
 *  - threshold 값 자체를 마커 텍스트로 사용 (30억 → "30")
 *
 * 색상은 threshold가 클수록 강조되는 그라디언트.
 */

const AMOUNT_KRW_TO_EOK = 1e8;

/** 표시 임계값(억). 오름차순 유지 필수. */
export const AMOUNT_MARKER_THRESHOLDS_EOK = [
    30, 40, 50, 60, 70, 80, 90, 100, 200, 300,
] as const;

export interface AmountMarkerInfo {
    /** 마커 텍스트 (threshold 값 그대로) */
    text: string;
    /** 색상 (hex) */
    color: string;
}

/**
 * 거래대금에 해당하는 가장 큰 임계의 마커 정보 반환.
 * 어떤 임계도 넘지 못하면 null.
 */
export function amountMarkerFor(amountKrw: number | null | undefined): AmountMarkerInfo | null {
    if (amountKrw == null || !Number.isFinite(amountKrw) || amountKrw <= 0) return null;
    const eok = amountKrw / AMOUNT_KRW_TO_EOK;

    let matched: number | null = null;
    for (const t of AMOUNT_MARKER_THRESHOLDS_EOK) {
        if (eok >= t) matched = t;
        else break; // 오름차순이므로 더 큰 임계는 볼 필요 없음
    }
    if (matched === null) return null;

    return {
        text: String(matched),
        color: amountMarkerColor(matched),
    };
}

function amountMarkerColor(threshold: number): string {
    // 일봉 high-rate marker와 시각적 일관성을 유지하는 그라디언트
    if (threshold < 50) return "#fbbf24";   // 30, 40
    if (threshold < 80) return "#fb923c";   // 50, 60, 70
    if (threshold < 100) return "#ef4444";  // 80, 90
    if (threshold < 200) return "#a855f7";  // 100
    return "#7c3aed";                        // 200, 300+
}
