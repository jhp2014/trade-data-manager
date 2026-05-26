import { describe, it, expect } from "vitest";
import { fillMissingMinuteCandles, fillMissingOverlayPoints } from "../chartPadding";
import type { MinuteCandle, ChartOverlayPoint } from "@/types/chart";

function ohlc(value: number) {
    return { open: value, high: value, low: value, close: value };
}

function candle(time: number, krxClose: number, nxtClose: number, accAmount = 0): MinuteCandle {
    return {
        time,
        krx: ohlc(krxClose),
        nxt: ohlc(nxtClose),
        volume: 0,
        amount: 0,
        accAmount,
    };
}

describe("fillMissingMinuteCandles", () => {
    it("길이 1 이하는 그대로 반환", () => {
        expect(fillMissingMinuteCandles([])).toEqual([]);
        const single = [candle(60, 1, 2)];
        expect(fillMissingMinuteCandles(single)).toBe(single);
    });

    it("간격이 정확히 stepSec이면 그대로 반환", () => {
        const input = [candle(60, 1, 2), candle(120, 3, 4), candle(180, 5, 6)];
        const out = fillMissingMinuteCandles(input);
        expect(out).toEqual(input);
    });

    it("중간에 빈 슬롯을 직전 close 값으로 채운다", () => {
        const input = [candle(60, 1.0, 2.0, 1000), candle(240, 5.0, 6.0, 5000)];
        const out = fillMissingMinuteCandles(input);

        expect(out).toHaveLength(4);
        expect(out[0]).toEqual(input[0]);

        // 채워진 두 슬롯: 직전 close (1.0 / 2.0) 로 OHLC 동일
        expect(out[1]).toEqual({
            time: 120,
            krx: ohlc(1.0),
            nxt: ohlc(2.0),
            volume: 0,
            amount: 0,
            accAmount: 1000,
        });
        expect(out[2]).toEqual({
            time: 180,
            krx: ohlc(1.0),
            nxt: ohlc(2.0),
            volume: 0,
            amount: 0,
            accAmount: 1000,
        });
        expect(out[3]).toEqual(input[1]);
    });

    it("accAmount가 누락된 경우 0으로 채운다", () => {
        const input: MinuteCandle[] = [
            { time: 60, krx: ohlc(1), nxt: ohlc(2), volume: 0, amount: 0 },
            { time: 180, krx: ohlc(3), nxt: ohlc(4), volume: 0, amount: 0 },
        ];
        const out = fillMissingMinuteCandles(input);
        expect(out[1].accAmount).toBe(0);
    });

    it("커스텀 stepSec(예: 300초)을 지원한다", () => {
        const input = [candle(0, 1, 2), candle(900, 3, 4)];
        const out = fillMissingMinuteCandles(input, 300);
        expect(out.map((c) => c.time)).toEqual([0, 300, 600, 900]);
    });
});

describe("fillMissingOverlayPoints", () => {
    function point(time: number, valueKrx: number, valueNxt: number, cumAmount = 0): ChartOverlayPoint {
        return { time, valueKrx, valueNxt, amount: 0, cumAmount };
    }

    it("빈 슬롯은 직전 등락률/누적을 유지하고 분 거래대금만 0", () => {
        const input = [point(60, 5.0, 6.0, 100), point(240, 7.0, 8.0, 500)];
        const out = fillMissingOverlayPoints(input);

        expect(out).toHaveLength(4);
        expect(out[1]).toEqual({ time: 120, valueKrx: 5.0, valueNxt: 6.0, amount: 0, cumAmount: 100 });
        expect(out[2]).toEqual({ time: 180, valueKrx: 5.0, valueNxt: 6.0, amount: 0, cumAmount: 100 });
    });
});
