import { describe, it, expect } from "vitest";
import { computePriceLineChartValue } from "../chart/priceLines";

describe("computePriceLineChartValue", () => {
    describe("asPrice = true", () => {
        it("유한값이면 그대로 반환", () => {
            expect(computePriceLineChartValue(50000, 48000, true)).toBe(50000);
            expect(computePriceLineChartValue(50000, null, true)).toBe(50000);
        });

        it("비유한값이면 null", () => {
            expect(computePriceLineChartValue(NaN, 48000, true)).toBeNull();
            expect(computePriceLineChartValue(Infinity, 48000, true)).toBeNull();
        });
    });

    describe("asPrice = false (등락률 변환)", () => {
        it("prevClose가 null이면 null", () => {
            expect(computePriceLineChartValue(50000, null, false)).toBeNull();
        });

        it("prevClose가 0 이하면 null", () => {
            expect(computePriceLineChartValue(50000, 0, false)).toBeNull();
            expect(computePriceLineChartValue(50000, -100, false)).toBeNull();
        });

        it("정상 입력은 ((price - prev) / prev) * 100 반환", () => {
            // (110 - 100) / 100 * 100 = 10
            expect(computePriceLineChartValue(110, 100, false)).toBeCloseTo(10);
            // (95 - 100) / 100 * 100 = -5
            expect(computePriceLineChartValue(95, 100, false)).toBeCloseTo(-5);
        });

        it("결과가 NaN이면 null", () => {
            expect(computePriceLineChartValue(NaN, 100, false)).toBeNull();
        });
    });
});
