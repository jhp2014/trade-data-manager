import { describe, it, expect } from "vitest";
import { selectMinuteTop100Ever, type PoolStockMinutes } from "../minuteRank.js";
import type { MinuteCandle } from "../model.js";

// un 바: O=H=L=C=price, volume=vol → 분봉거래대금 = price×vol.
const candle = (stockCode: string, time: string, price: string, vol: string): MinuteCandle => ({
    stockCode,
    date: "2026-06-26",
    time,
    krx: null,
    un: { open: price, high: price, low: price, close: price, volume: vol },
});

describe("selectMinuteTop100Ever", () => {
    it("장중 한 시점이라도 탑N 이면 포함(모닝 주도주 포착)", () => {
        // topN=1. EARLY=오전에 1위였다 밀림, LATE=오후에 역전 1위, MID=항상 2위 → 둘만 ever-탑1.
        const pool: PoolStockMinutes[] = [
            { stockCode: "EARLY", candles: [candle("EARLY", "09:00:00", "1000", "1000"), candle("EARLY", "09:01:00", "1000", "0")] }, // 누적 1e6, 1e6
            { stockCode: "MID", candles: [candle("MID", "09:00:00", "1000", "500"), candle("MID", "09:01:00", "1000", "0")] }, // 누적 5e5, 5e5
            { stockCode: "LATE", candles: [candle("LATE", "09:01:00", "1000", "3000")] }, // 09:01 누적 3e6
        ];
        const out = selectMinuteTop100Ever(pool, 1);
        // 09:00 → EARLY(1e6) 1위, 09:01 → LATE(3e6) 1위. MID 한 번도 1위 아님.
        expect(out.sort()).toEqual(["EARLY", "LATE"]);
    });

    it("topN 이 종목 수 이상이면 (거래 있는) 전부 포함", () => {
        const pool: PoolStockMinutes[] = [
            { stockCode: "A", candles: [candle("A", "09:00:00", "100", "10")] },
            { stockCode: "B", candles: [candle("B", "09:00:00", "100", "20")] },
        ];
        expect(selectMinuteTop100Ever(pool, 100).sort()).toEqual(["A", "B"]);
    });

    it("빈 분봉 종목은 순위에서 제외", () => {
        const pool: PoolStockMinutes[] = [
            { stockCode: "TRADED", candles: [candle("TRADED", "09:00:00", "100", "10")] },
            { stockCode: "EMPTY", candles: [] },
        ];
        expect(selectMinuteTop100Ever(pool, 100)).toEqual(["TRADED"]);
    });

    it("입력 순서를 보존한다", () => {
        const pool: PoolStockMinutes[] = [
            { stockCode: "Z", candles: [candle("Z", "09:00:00", "100", "30")] },
            { stockCode: "Y", candles: [candle("Y", "09:00:00", "100", "20")] },
            { stockCode: "X", candles: [candle("X", "09:00:00", "100", "10")] },
        ];
        expect(selectMinuteTop100Ever(pool, 100)).toEqual(["Z", "Y", "X"]);
    });
});
