/**
 * 차트 시각화용 빈 분봉 슬롯 채우기.
 * 빈 구간을 null 값 슬롯으로 채워 시간축 간격을 균일하게 유지한다(Option B).
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
