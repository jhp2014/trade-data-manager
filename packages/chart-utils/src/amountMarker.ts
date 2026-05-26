/**
 * 분봉 캔들의 거래대금(KRW)을 기반으로 임계 마커를 결정한다.
 *
 * 규칙:
 *  - amount(원) ÷ 1억 ≥ threshold 면 해당 threshold 후보
 *  - 여러 후보 중 가장 큰 threshold 하나만 표시
 *  - threshold 값 자체를 마커 텍스트로 사용 (30억 → "30")
 */

import { AMOUNT_MARKER_THRESHOLDS_EOK, amountMarkerColor } from "./colors";

const KRW_TO_EOK = 1e8;

export interface AmountMarkerInfo {
    /** 마커 텍스트 (threshold 값 그대로) */
    text: string;
    /** 색상 (hex) */
    color: string;
}

/** 거래대금에 해당하는 가장 큰 임계의 마커 정보 반환. 어느 임계도 넘지 못하면 null. */
export function amountMarkerFor(amountKrw: number | null | undefined): AmountMarkerInfo | null {
    if (amountKrw == null || !Number.isFinite(amountKrw) || amountKrw <= 0) return null;
    const eok = amountKrw / KRW_TO_EOK;

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
