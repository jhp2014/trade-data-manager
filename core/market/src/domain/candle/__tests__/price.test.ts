import { describe, it, expect } from "vitest";
import {
    computeChangeValue,
    computeChangeRate,
    computeMinuteTradingAmount,
    computeAccumulatedAmounts,
    countByAmountThreshold,
    previousCloseFromDaily,
    basePricesOf,
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

describe("basePricesOf", () => {
    const bar = (close: string) => ({ open: close, high: close, low: close, close, volume: "1", amount: "1" });
    const candle = (date: string, krxClose: string, unClose: string): DailyCandle => ({
        stockCode: "000001",
        date,
        krx: bar(krxClose),
        un: bar(unClose),
    });

    it("평상일(수정=원주 동일) — 원주가 전일종가와 항등, factor 1", () => {
        const raw = [candle("2026-07-09", "98", "100"), candle("2026-07-10", "104", "105")];
        const { base, factor } = basePricesOf(raw, raw, "2026-07-10");
        expect(base).toEqual({ krx: 98, un: 100 });
        expect(factor).toEqual({ krx: 1, un: 1 });
    });

    it("이벤트 첫 거래일(감자) — 전일만 소급 재작성 → factor = 기준가 배율", () => {
        const raw = [candle("2026-05-07", "1533", "1533"), candle("2026-05-08", "9970", "9970")];
        const adj = [candle("2026-05-07", "7670", "7670"), candle("2026-05-08", "9970", "9970")];
        const { base, factor } = basePricesOf(raw, adj, "2026-05-08");
        expect(base.un).toBeCloseTo(7670, 6);
        expect(factor.un).toBeCloseTo(7670 / 1533, 6);
    });

    it("과거일 재계산(나중 이벤트로 전일·당일 둘 다 재작성) — 상쇄되어 factor 1", () => {
        const raw = [candle("2026-07-09", "100", "100"), candle("2026-07-10", "108", "108")];
        const adj = [candle("2026-07-09", "50", "50"), candle("2026-07-10", "54", "54")]; // 이후 2:1 액분 재작성
        const { base, factor } = basePricesOf(raw, adj, "2026-07-10");
        expect(base).toEqual({ krx: 100, un: 100 });
        expect(factor).toEqual({ krx: 1, un: 1 });
    });

    it("재작성 반올림 잔차(<0.2%)는 1로 클램프 — 노이즈가 base 를 흔들지 않음", () => {
        // 진짜 계수 g=1/3 재작성: adj = round(raw/3) → 비율에 미세 잔차
        const raw = [candle("2026-07-09", "1000", "1000"), candle("2026-07-10", "1004", "1004")];
        const adj = [candle("2026-07-09", "333", "333"), candle("2026-07-10", "335", "335")];
        const { base, factor } = basePricesOf(raw, adj, "2026-07-10");
        expect(factor.un).toBe(1);
        expect(base.un).toBe(1000);
    });

    it("당일 raw≠adj(수집사고류 불일치) — factor ≠ 1 로 드러남(트립와이어 신호)", () => {
        const raw = [candle("2026-07-02", "34700", "34700"), candle("2026-07-03", "34050", "34050")]; // 당일 비최종 동결
        const adj = [candle("2026-07-02", "34700", "34700"), candle("2026-07-03", "34550", "34550")];
        const { factor } = basePricesOf(raw, adj, "2026-07-03");
        expect(factor.un).not.toBe(1); // 1/(34550/34050) ≈ 0.9855
        expect(factor.un).toBeCloseTo(34050 / 34550, 4);
    });

    it("전일 수정주가 결손(같은 날짜 쌍 없음) — 보정 포기, 원주가 그대로", () => {
        const raw = [candle("2026-07-09", "100", "100"), candle("2026-07-10", "108", "108")];
        const adj = [candle("2026-07-10", "54", "54")]; // 전일 없음
        const { base, factor } = basePricesOf(raw, adj, "2026-07-10");
        expect(base).toEqual({ krx: 100, un: 100 });
        expect(factor).toEqual({ krx: 1, un: 1 });
    });

    it("원주가 직전 종가 없으면(상장일) base null", () => {
        const raw = [candle("2026-07-10", "108", "108")];
        expect(basePricesOf(raw, raw, "2026-07-10").base).toEqual({ krx: null, un: null });
    });
});
