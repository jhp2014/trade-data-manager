import { describe, expect, it } from "vitest";
import { resolveInitialSelection } from "@/lib/selection";
import { buildReviewPath } from "@/lib/url";
import type { ReviewStockGroup } from "@/types/review";

const groups: ReviewStockGroup[] = [
  {
    groupKey: "005930|2026-05-27",
    stockCode: "005930",
    stockName: "삼성전자",
    tradeDate: "2026-05-27",
    points: [
      {
        pointKey: "p1",
        tradeTime: "09:12",
        rowNumber: 2,
        reviewId: "11",
        manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
        sourceRow: {
          reviewId: "11",
          rowNumber: 2,
          stockCode: "005930",
          stockName: "삼성전자",
          tradeDate: "2026-05-27",
          tradeTime: "09:12",
          features: {},
          manual: {},
        },
      },
      {
        pointKey: "p2",
        tradeTime: "10:30",
        rowNumber: 3,
        reviewId: "12",
        manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
        sourceRow: {
          reviewId: "12",
          rowNumber: 3,
          stockCode: "005930",
          stockName: "삼성전자",
          tradeDate: "2026-05-27",
          tradeTime: "10:30",
          features: {},
          manual: {},
        },
      },
    ],
  },
  {
    groupKey: "000660|2026-05-27",
    stockCode: "000660",
    stockName: "SK하이닉스",
    tradeDate: "2026-05-27",
    points: [
      {
        pointKey: "h1",
        tradeTime: "",
        rowNumber: 4,
        reviewId: "",
        manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
        sourceRow: {
          reviewId: "",
          rowNumber: 4,
          stockCode: "000660",
          stockName: "SK하이닉스",
          tradeDate: "2026-05-27",
          tradeTime: "",
          features: {},
          manual: {},
        },
      },
    ],
  },
];

describe("selection and url helpers", () => {
  it("resolves group and point from route params", () => {
    expect(resolveInitialSelection(groups, {
      stockCode: "005930",
      tradeDate: "2026-05-27",
      tradeTime: "10:30:00",
    })).toEqual({
      selectedGroupIndex: 0,
      selectedPointKey: "p2",
    });
  });

  it("falls back to the first group and first point when params are outside the workset", () => {
    expect(resolveInitialSelection(groups, {
      stockCode: "999999",
      tradeDate: "2026-05-27",
      tradeTime: "09:00",
    })).toEqual({
      selectedGroupIndex: 0,
      selectedPointKey: "p1",
    });
  });

  it("builds review paths and defaults empty tradeTime to 09:00", () => {
    expect(buildReviewPath(groups[0], groups[0].points[0])).toBe("/review/005930/2026-05-27/09:12");
    expect(buildReviewPath(groups[1], groups[1].points[0])).toBe("/review/000660/2026-05-27/09:00");
  });
});
