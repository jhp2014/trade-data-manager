/**
 * 차트 시각화용 빈 분봉 슬롯 채우기.
 * See: docs/decisions/003-chartpadding-option-b.md
 */

import type { MinuteCandle, ChartOverlayPoint } from "@/types/chart";

export function fillMissingMinuteCandles(
    candles: MinuteCandle[],
    stepSec = 60,
): MinuteCandle[] {
    if (candles.length <= 1) return candles;

    const result: MinuteCandle[] = [];
    for (let i = 0; i < candles.length; i++) {
        const cur = candles[i];
        result.push(cur);

        const next = candles[i + 1];
        if (!next) break;

        let t = cur.time + stepSec;
        while (t < next.time) {
            result.push({
                time: t,
                krx: { open: cur.krx.close, high: cur.krx.close, low: cur.krx.close, close: cur.krx.close },
                nxt: { open: cur.nxt.close, high: cur.nxt.close, low: cur.nxt.close, close: cur.nxt.close },
                volume: 0,
                amount: 0,
                accAmount: cur.accAmount ?? 0,
            });
            t += stepSec;
        }
    }
    return result;
}

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
