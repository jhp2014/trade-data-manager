import { describe, expect, it } from "vitest";
import {
  computePriceLineChartValue,
  stripLinePrefix,
  colorForPriceLineKey,
  buildPriceLineOptions,
} from "@/lib/chart/priceLines";
import { PRICE_LINE_PALETTE } from "@/lib/colors";

describe("computePriceLineChartValue", () => {
  it("asPrice=true 는 가격을 그대로(유한값만)", () => {
    expect(computePriceLineChartValue(9010, null, true)).toBe(9010);
    expect(computePriceLineChartValue(Number.NaN, null, true)).toBeNull();
  });
  it("asPrice=false 는 prevClose 기준 %로 변환", () => {
    expect(computePriceLineChartValue(110, 100, false)).toBe(10); // (110-100)/100*100
  });
  it("asPrice=false 인데 prevClose 가 없거나 ≤0 이면 null", () => {
    expect(computePriceLineChartValue(110, null, false)).toBeNull();
    expect(computePriceLineChartValue(110, 0, false)).toBeNull();
  });
});

describe("stripLinePrefix", () => {
  it("line_ 접두사를 떼고, 없으면 그대로", () => {
    expect(stripLinePrefix("line_support")).toBe("support");
    expect(stripLinePrefix("support")).toBe("support");
  });
});

describe("colorForPriceLineKey", () => {
  it("같은 키는 항상 같은 색(결정론)이며 팔레트 안의 색", () => {
    const c1 = colorForPriceLineKey("line_a");
    const c2 = colorForPriceLineKey("line_a");
    expect(c1).toBe(c2);
    expect(PRICE_LINE_PALETTE).toContain(c1);
  });
});

describe("buildPriceLineOptions", () => {
  it("asPrice=false 면 라벨에 ' %' 를, true 면 빈 제목", () => {
    expect(buildPriceLineOptions("line_support", 110, 10, false).title).toBe("support %");
    expect(buildPriceLineOptions("line_support", 9010, 9010, true).title).toBe("");
  });
});
