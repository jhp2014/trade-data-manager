import { describe, expect, it } from "vitest";
import type { MinuteCandle } from "../../schema/market";
import type { MinuteCandleContext } from "../types";
import { AmountCountCalculator } from "../calculators/AmountCountCalculator";
import { ChangeRateCalculator } from "../calculators/ChangeRateCalculator";
import { CloseRateKrxCalculator } from "../calculators/CloseRateKrxCalculator";
import { CloseRateNxtCalculator } from "../calculators/CloseRateNxtCalculator";
import { CumulativeAmountCalculator } from "../calculators/CumulativeAmountCalculator";
import { DayHighCalculator } from "../calculators/DayHighCalculator";
import { PullbackCalculator } from "../calculators/PullbackCalculator";
import { TradingAmountCalculator } from "../calculators/TradingAmountCalculator";

function candle(overrides: Partial<MinuteCandle>): MinuteCandle {
    return {
        id: 1n,
        dailyCandleId: 10n,
        tradeDate: "2026-05-27",
        stockCode: "005930",
        tradeTime: "09:00:00",
        unixTimestamp: 0,
        open: "1000",
        high: "1000",
        low: "1000",
        close: "1000",
        tradingVolume: 1n,
        tradingAmount: "0",
        accumulatedTradingAmount: "0",
        openRateKrx: "0",
        highRateKrx: "0",
        lowRateKrx: "0",
        closeRateKrx: "0",
        openRateNxt: "0",
        highRateNxt: "0",
        lowRateNxt: "0",
        closeRateNxt: "0",
        ...overrides,
    };
}

function ctx(current: MinuteCandle, candles: MinuteCandle[] = [current], index = 0): MinuteCandleContext {
    return {
        current,
        candles,
        index,
        findCandleMinutesAgo: (minutesAgo) => {
            const curMin = Number(current.tradeTime.slice(3, 5));
            const targetMinute = curMin - minutesAgo;
            return candles.find((item) => Number(item.tradeTime.slice(3, 5)) <= targetMinute) ?? null;
        },
    };
}

describe("minute feature calculators", () => {
    it("copies close rates and trading amount from the current candle", () => {
        const current = candle({
            closeRateKrx: "1.2500",
            closeRateNxt: "1.5000",
            tradingAmount: "3500000000",
        });

        expect(new CloseRateKrxCalculator().calculate(ctx(current))).toEqual({ closeRateKrx: "1.2500" });
        expect(new CloseRateNxtCalculator().calculate(ctx(current))).toEqual({ closeRateNxt: "1.5000" });
        expect(new TradingAmountCalculator().calculate(ctx(current))).toEqual({ tradingAmount: "3500000000" });
    });

    it("falls back null close rates to zero", () => {
        const current = candle({ closeRateKrx: null, closeRateNxt: null });

        expect(new CloseRateKrxCalculator().calculate(ctx(current))).toEqual({ closeRateKrx: "0" });
        expect(new CloseRateNxtCalculator().calculate(ctx(current))).toEqual({ closeRateNxt: "0" });
    });

    it("calculates N-minute close rate changes and returns null when no past candle exists", () => {
        const calc = new ChangeRateCalculator(5);
        const past = candle({ tradeTime: "09:05:00", closeRateNxt: "1.20" });
        const current = candle({ tradeTime: "09:10:00", closeRateNxt: "3.70" });

        expect(calc.calculate(ctx(current, [past, current], 1))).toEqual({ changeRate5m: "2.50" });
        expect(calc.calculate(ctx(candle({ tradeTime: "09:01:00", closeRateNxt: "1.00" })))).toEqual({
            changeRate5m: null,
        });
    });

    it("tracks day high rate and time across candles", () => {
        const calc = new DayHighCalculator();
        const first = candle({ tradeTime: "09:00:00", highRateNxt: "2.0000" });
        const second = candle({ tradeTime: "09:01:00", highRateNxt: "3.5000" });
        const third = candle({ tradeTime: "09:02:00", highRateNxt: "3.1000" });

        expect(calc.calculate(ctx(first))).toEqual({ dayHighRate: "2.0000", dayHighTime: "09:00:00" });
        expect(calc.calculate(ctx(second))).toEqual({ dayHighRate: "3.5000", dayHighTime: "09:01:00" });
        expect(calc.calculate(ctx(third))).toEqual({ dayHighRate: "3.5000", dayHighTime: "09:01:00" });

        calc.reset();
        expect(calc.calculate(ctx(third))).toEqual({ dayHighRate: "3.1000", dayHighTime: "09:02:00" });
    });

    it("calculates pullback from the tracked day high", () => {
        const calc = new PullbackCalculator();
        const first = candle({ tradeTime: "09:00:00", highRateNxt: "2.0000", closeRateNxt: "1.8000" });
        const second = candle({ tradeTime: "09:01:00", highRateNxt: "3.5000", closeRateNxt: "3.2000" });
        const third = candle({ tradeTime: "09:02:00", highRateNxt: "3.1000", closeRateNxt: "2.7000" });

        expect(calc.calculate(ctx(first))).toEqual({ pullbackFromDayHigh: "-0.2000", minutesSinceDayHigh: 0 });
        expect(calc.calculate(ctx(second))).toEqual({ pullbackFromDayHigh: "-0.3000", minutesSinceDayHigh: 1 });
        expect(calc.calculate(ctx(third))).toEqual({ pullbackFromDayHigh: "-0.8000", minutesSinceDayHigh: 1 });
    });

    it("accumulates trading amount", () => {
        const calc = new CumulativeAmountCalculator();

        expect(calc.calculate(ctx(candle({ tradingAmount: "3000000000" })))).toEqual({
            cumulativeTradingAmount: "3000000000",
        });
        expect(calc.calculate(ctx(candle({ tradingAmount: "4500000000" })))).toEqual({
            cumulativeTradingAmount: "7500000000",
        });

        calc.reset();
        expect(calc.calculate(ctx(candle({ tradingAmount: "1000000000" })))).toEqual({
            cumulativeTradingAmount: "1000000000",
        });
    });

    it("counts candles whose amount is greater than or equal to the threshold", () => {
        const calc = new AmountCountCalculator(30);

        expect(calc.calculate(ctx(candle({ tradingAmount: "2500000000" })))).toEqual({ cnt30Amt: 0 });
        expect(calc.calculate(ctx(candle({ tradingAmount: "3000000000" })))).toEqual({ cnt30Amt: 1 });
        expect(calc.calculate(ctx(candle({ tradingAmount: "5000000000" })))).toEqual({ cnt30Amt: 2 });
    });
});
