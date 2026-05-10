import type { MinuteCandle } from "./chartTypes";

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
