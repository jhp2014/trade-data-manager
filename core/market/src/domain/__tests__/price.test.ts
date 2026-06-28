import { describe, it, expect } from "vitest";
import {
    computeChangeValue,
    computeChangeRate,
    computeMinuteTradingAmount,
    computeAccumulatedAmounts,
} from "../price.js";

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
