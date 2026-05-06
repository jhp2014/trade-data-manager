/* ===========================================================
 * 차트 시각화용 빈 슬롯 채우기 (data-view 책임)
 *
 * 분봉 raw 데이터에는 거래가 없는 분이 누락되어 있는데,
 * lightweight-charts 가 시간 축에서 끊김 없이 표시되도록
 * placeholder 봉을 채워 넣습니다.
 *
 * 정책 (옵션 B):
 *  - 첫 봉 ~ 마지막 봉 사이의 비어있는 분만 채움
 *  - placeholder 는 직전 유효봉의 close 값을 OHLC 모두에 사용
 *  - volume / amount 는 0
 *  - cumAmount 는 직전 누적값 그대로 유지
 *  - 첫 봉 이전 / 마지막 봉 이후는 채우지 않음
 * =========================================================== */

import type { ChartCandle, ChartOverlayPoint } from "@/actions/chartPreview";

export function fillMissingMinuteCandles(
    candles: ChartCandle[],
    stepSec = 60,
): ChartCandle[] {
    if (candles.length <= 1) return candles;

    const result: ChartCandle[] = [];
    for (let i = 0; i < candles.length; i++) {
        const cur = candles[i];
        result.push(cur);

        const next = candles[i + 1];
        if (!next) break;

        let t = cur.time + stepSec;
        while (t < next.time) {
            result.push({
                time: t,
                open: cur.close,
                high: cur.close,
                low: cur.close,
                close: cur.close,
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
                value: cur.value,        // 직전 등락률 유지
                amount: 0,                // 분 거래대금 0
                cumAmount: cur.cumAmount, // 누적은 직전 그대로
            });
            t += stepSec;
        }
    }
    return result;
}
