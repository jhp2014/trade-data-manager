/**
 * data-view 전용 오버레이 패딩.
 * 분봉 패딩(fillMissingMinuteCandles)은 @trade-data-manager/chart-utils 로 이동.
 */

import type { ChartOverlayPoint } from "@/types/chart";

export function fillMissingOverlayPoints(
    points: ChartOverlayPoint[],
    stepSec = 60,
): ChartOverlayPoint[] {
    if (points.length <= 1) return points;

    const result: ChartOverlayPoint[] = [];
    for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        result.push(cur);

        const next = points[i + 1];
        if (!next) break;

        let t = cur.time + stepSec;
        while (t < next.time) {
            result.push({
                time: t,
                valueKrx: cur.valueKrx,  // 직전 KRX 등락률 유지
                valueNxt: cur.valueNxt,   // 직전 NXT 등락률 유지
                amount: 0,                // 분 거래대금 0
                cumAmount: cur.cumAmount, // 누적은 직전 그대로
            });
            t += stepSec;
        }
    }
    return result;
}
