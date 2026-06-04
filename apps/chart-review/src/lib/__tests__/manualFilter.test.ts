import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  payloadMatchesManualFilters,
  pointMatchesManualFilters,
} from "@/lib/manualFilter";
import type { ReviewPoint } from "@/types/review";

describe("manualFilter", () => {
  it("counts only filters that have selected values", () => {
    expect(activeFilterCount({ result: ["good"], tag: [], mood: ["strong", "weak"] })).toBe(2);
  });

  it("matches payloads with AND between keys and OR inside a key", () => {
    const payload = {
      result: "good",
      tag: "breakout | volume",
    };

    expect(payloadMatchesManualFilters(payload, {
      result: ["good", "watch"],
      tag: ["volume"],
    })).toBe(true);

    expect(payloadMatchesManualFilters(payload, {
      result: ["good"],
      tag: ["pullback"],
    })).toBe(false);
  });

  it("supports array payload values", () => {
    expect(payloadMatchesManualFilters(
      { tag: ["breakout", "volume"] },
      { tag: ["volume"] },
    )).toBe(true);
  });

  it("matches ReviewPoint manual values", () => {
    const point: ReviewPoint = {
      pointKey: "p1",
      tradeTime: "09:12",
      rowNumber: 2,
      reviewId: "11",
      manualSummary: {
        filledCount: 1,
        totalCount: 1,
        missingRequired: [],
        preview: {},
      },
      sourceRow: {
        reviewId: "11",
        rowNumber: 2,
        stockCode: "005930",
        stockName: "삼성전자",
        tradeDate: "2026-05-27",
        tradeTime: "09:12",
        features: {},
        manual: { result: "good" },
      },
    };

    expect(pointMatchesManualFilters(point, { result: ["good"] })).toBe(true);
    expect(pointMatchesManualFilters(point, { result: ["bad"] })).toBe(false);
  });
});
