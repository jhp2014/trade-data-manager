import { describe, expect, it } from "vitest";
import { deriveDailyView, deriveMinuteView } from "./derive.js";
import type { ChartBundle, DailyBar, MinuteBar } from "../market/types.js";

const dbar = (close: string, high = close, amount = "100000000"): DailyBar => ({ open: close, high, low: close, close, volume: "1", amount });
const mbar = (o: string, h: string, l: string, c: string, v: string): MinuteBar => ({ open: o, high: h, low: l, close: c, volume: v });

function bundle(over: Partial<ChartBundle> = {}): ChartBundle {
    return {
        stockCode: "402340",
        daily: [
            { stockCode: "402340", date: "2026-07-30", krx: dbar("1000"), un: dbar("1010") },
            { stockCode: "402340", date: "2026-07-31", krx: dbar("1100", "1200"), un: dbar("1110", "1210") },
        ],
        minutes: [
            { stockCode: "402340", date: "2026-07-31", time: "09:00:00", krx: null, un: mbar("1000", "1100", "1000", "1050", "10") },
            { stockCode: "402340", date: "2026-07-31", time: "09:01:00", krx: null, un: mbar("1050", "1050", "1000", "1000", "20") },
        ],
        basePrice: { krx: 1000, un: 500 },
        ...over,
    };
}

describe("deriveDailyView", () => {
    it("mode 시장의 바를 숫자로, prevClose 는 직전 봉 종가", () => {
        const krx = deriveDailyView(bundle(), "krx");
        expect(krx.map((p) => p.close)).toEqual([1000, 1100]);
        expect(krx[1]).toMatchObject({ time: "2026-07-31", high: 1200, prevClose: 1000, highPct: 20, amount: 1e8 });
        expect(krx[0].prevClose).toBeNull();
        expect(krx[0].highPct).toBeNull();
        expect(deriveDailyView(bundle(), "un")[1].prevClose).toBe(1010);
    });
});

describe("deriveMinuteView", () => {
    it("봉은 UN 바를 mode 기준가 대비 %로, 거래대금은 OHLC 평균(내림)×량, 누적", () => {
        const v = deriveMinuteView(bundle(), "krx");
        expect(v.baseFallback).toBe(false);
        expect(v.points[0]).toMatchObject({ tradeTime: "09:00:00", open: 0, high: 10, close: 5 });
        // (1000+1100+1000+1050)/4 = 1037(내림) × 10
        expect(v.points[0].amount).toBe(10370);
        // (1050+1050+1000+1000)/4 = 1025 × 20 = 20500 → 누적 30870
        expect(v.points[1].cumAmount).toBe(30870);
    });
    it("mode 는 기준가만 바꾼다", () => {
        expect(deriveMinuteView(bundle(), "un").points[0].close).toBe(110); // 1050 vs 500
    });
    it("기준가가 없으면 첫 UN 시가로 대신하고 표시한다", () => {
        const v = deriveMinuteView(bundle({ basePrice: null }), "un");
        expect(v.baseFallback).toBe(true);
        expect(v.points[0].open).toBe(0);
        expect(v.points[0].close).toBe(5); // 1050 vs 첫 시가 1000
    });
    it("분봉이 없으면 빈 뷰", () => {
        expect(deriveMinuteView(bundle({ minutes: [] }), "un")).toEqual({ points: [], baseFallback: false });
    });
});
