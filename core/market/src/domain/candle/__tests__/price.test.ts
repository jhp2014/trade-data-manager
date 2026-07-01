import { describe, it, expect } from "vitest";
import {
    computeChangeValue,
    computeChangeRate,
    computeMinuteTradingAmount,
    computeAccumulatedAmounts,
    countByAmountThreshold,
    previousCloseFromDaily,
} from "../price.js";
import type { DailyCandle } from "../model.js";

describe("computeChangeValue", () => {
    it("현재가 - 전일종가", () => {
        expect(computeChangeValue("78800", "78600")).toBe("200");
    });
    it("하락이면 음수", () => {
        expect(computeChangeValue("78600", "78800")).toBe("-200");
    });
    it("전일종가 없으면 null", () => {
        expect(computeChangeValue("78800", null)).toBeNull();
    });
    it("큰 값도 정밀(BigInt)", () => {
        expect(computeChangeValue("9999999999999999", "1")).toBe("9999999999999998");
    });
});

describe("computeChangeRate", () => {
    it("소수 4자리 문자열", () => {
        // 200/78600*100 = 0.25445...
        expect(computeChangeRate("78800", "78600")).toBe("0.2545");
    });
    it("하락률은 음수", () => {
        expect(computeChangeRate("78600", "78800")).toBe("-0.2538");
    });
    it("기준가 0이면 null", () => {
        expect(computeChangeRate("78800", "0")).toBeNull();
    });
    it("기준가 없으면 null", () => {
        expect(computeChangeRate("78800", null)).toBeNull();
    });
});

describe("computeMinuteTradingAmount", () => {
    it("(O+H+L+C)/4 × 거래량", () => {
        // (100+200+150+250)/4 = 175, ×10 = 1750
        expect(
            computeMinuteTradingAmount({ open: "100", high: "200", low: "150", close: "250", volume: "10" }),
        ).toBe("1750");
    });
    it("평균가는 정수 내림", () => {
        // (100+100+100+101)/4 = 100(내림), ×1 = 100
        expect(
            computeMinuteTradingAmount({ open: "100", high: "100", low: "100", close: "101", volume: "1" }),
        ).toBe("100");
    });
    it("거래량 0이면 0", () => {
        expect(
            computeMinuteTradingAmount({ open: "100", high: "200", low: "150", close: "250", volume: "0" }),
        ).toBe("0");
    });
});

describe("computeAccumulatedAmounts", () => {
    it("러닝 누적합", () => {
        expect(computeAccumulatedAmounts(["100", "200", "300"])).toEqual(["100", "300", "600"]);
    });
    it("빈 배열", () => {
        expect(computeAccumulatedAmounts([])).toEqual([]);
    });
    it("소수부는 버리고 정수부만 누적", () => {
        expect(computeAccumulatedAmounts(["100.9", "0.4"])).toEqual(["100", "100"]);
    });
});

describe("countByAmountThreshold", () => {
    const thresholds = [30, 50, 100] as const; // 억
    it("임계별 독립 카운트(누적 아님)", () => {
        // 20억·40억·120억 → 30억↑:2, 50억↑:1, 100억↑:1
        const amounts = ["2000000000", "4000000000", "12000000000"];
        expect(countByAmountThreshold(amounts, thresholds)).toEqual({ 30: 2, 50: 1, 100: 1 });
    });
    it("경계값은 이상(≥) 포함", () => {
        expect(countByAmountThreshold(["3000000000"], thresholds)).toEqual({ 30: 1, 50: 0, 100: 0 });
    });
    it("빈 입력이어도 모든 임계 키를 0으로 채움", () => {
        expect(countByAmountThreshold([], thresholds)).toEqual({ 30: 0, 50: 0, 100: 0 });
    });
    it("소수부는 버리고 비교", () => {
        expect(countByAmountThreshold(["2999999999.9"], [30])).toEqual({ 30: 0 });
    });
});

describe("previousCloseFromDaily", () => {
    const bar = (close: string) => ({ open: close, high: close, low: close, close, volume: "1", amount: "1" });
    const candle = (date: string, krxClose: string, unClose: string): DailyCandle => ({
        stockCode: "005930",
        date,
        krx: bar(krxClose),
        un: bar(unClose),
    });

    it("date 직전 거래일의 시장별 종가", () => {
        const daily = [candle("2026-06-24", "100", "101"), candle("2026-06-25", "200", "202"), candle("2026-06-26", "300", "303")];
        expect(previousCloseFromDaily(daily, "2026-06-26")).toEqual({ krxClose: "200", unClose: "202" });
    });
    it("당일 일봉 미적재여도 date 비교로 직전 종가", () => {
        const daily = [candle("2026-06-24", "100", "101"), candle("2026-06-25", "200", "202")];
        expect(previousCloseFromDaily(daily, "2026-06-26")).toEqual({ krxClose: "200", unClose: "202" });
    });
    it("직전 캔들 없으면(상장일) null", () => {
        expect(previousCloseFromDaily([candle("2026-06-26", "300", "303")], "2026-06-26")).toBeNull();
    });
    it("정렬 안 돼 있어도 최대 date<요청일을 고름", () => {
        const daily = [candle("2026-06-25", "200", "202"), candle("2026-06-24", "100", "101")];
        expect(previousCloseFromDaily(daily, "2026-06-26")).toEqual({ krxClose: "200", unClose: "202" });
    });
});
