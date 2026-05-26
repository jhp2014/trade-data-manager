/**
 * 차트 시각화용 빈 분봉 슬롯 채우기.
 * See: apps/data-view/docs/decisions/003-chartpadding-option-b.md
 */
import type { MinuteCandle } from "./types";

export function fillMissingMinuteCandles<T extends MinuteCandle>(
    candles: T[],
    stepSec = 60,
): T[] {
    if (candles.length <= 1) return candles;

    const result: T[] = [];
    for (let i = 0; i < candles.length; i++) {
        const cur = candles[i];
        result.push(cur);

        const next = candles[i + 1];
        if (!next) break;

        let t = cur.time + stepSec;
        while (t < next.time) {
            result.push({
                ...cur,
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
