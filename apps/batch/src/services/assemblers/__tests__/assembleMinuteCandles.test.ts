import { describe, it, expect } from "vitest";
import { assembleMinuteCandles } from "../candleAssembler.js";
import type { KiwoomMinuteCandle } from "../../../clients/types.js";

function candle(cntr_tm: string, opts: Partial<KiwoomMinuteCandle> = {}): KiwoomMinuteCandle {
    return {
        cntr_tm,
        cur_prc: opts.cur_prc ?? "1000",
        open_pric: opts.open_pric ?? "1000",
        high_pric: opts.high_pric ?? "1000",
        low_pric: opts.low_pric ?? "1000",
        trde_qty: opts.trde_qty ?? "100",
    };
}

const COMMON = {
    dailyCandleId: 1n,
    stockCode: "005930",
    tradeDate: "2026-05-11",
    previousCloseKrx: "950",
    previousCloseNxt: "950",
};

describe("assembleMinuteCandles", () => {
    it("입력이 비면 빈 배열", () => {
        const out = assembleMinuteCandles({ ...COMMON, candles: [] });
        expect(out).toEqual([]);
    });

    it("다른 거래일의 분봉은 필터링된다", () => {
        const candles = [
            candle("20260511093000"),
            candle("20260510153000"),  // 전일 — 제외
            candle("20260511094000"),
        ];
        const out = assembleMinuteCandles({ ...COMMON, candles });
        expect(out).toHaveLength(2);
        expect(out.map((r) => r.tradeTime)).toEqual(["09:30:00", "09:40:00"]);
    });

    it("필터링 후 같은 날 분봉이 없으면 빈 배열", () => {
        const candles = [candle("20260510153000")];
        const out = assembleMinuteCandles({ ...COMMON, candles });
        expect(out).toEqual([]);
    });

    it("시간 오름차순으로 정렬된다 (입력이 역순이어도)", () => {
        const candles = [
            candle("20260511150000"),
            candle("20260511093000"),
            candle("20260511120000"),
        ];
        const out = assembleMinuteCandles({ ...COMMON, candles });
        expect(out.map((r) => r.tradeTime)).toEqual([
            "09:30:00",
            "12:00:00",
            "15:00:00",
        ]);
    });

    it("accumulatedTradingAmount는 정렬 순서 기준으로 단조 증가한다", () => {
        const candles = [
            // (1000+1000+1000+1000)/4 * 100 = 100000 per candle
            candle("20260511093000"),
            candle("20260511094000"),
            candle("20260511095000"),
        ];
        const out = assembleMinuteCandles({ ...COMMON, candles });
        const accs = out.map((r) => BigInt(r.accumulatedTradingAmount as string));
        expect(accs).toEqual([100_000n, 200_000n, 300_000n]);
    });

    it("dailyCandleId / stockCode / tradeDate가 각 row에 주입된다", () => {
        const out = assembleMinuteCandles({
            ...COMMON,
            candles: [candle("20260511093000")],
        });
        expect(out[0].dailyCandleId).toBe(1n);
        expect(out[0].stockCode).toBe("005930");
        expect(out[0].tradeDate).toBe("2026-05-11");
    });

    it("전일 종가가 null이면 등락률 필드도 null", () => {
        const out = assembleMinuteCandles({
            ...COMMON,
            previousCloseKrx: null,
            previousCloseNxt: null,
            candles: [candle("20260511093000")],
        });
        expect(out[0].closeRateKrx).toBeNull();
        expect(out[0].closeRateNxt).toBeNull();
    });
});
