import { describe, expect, it } from "vitest";
import { groupSheetRows } from "@/lib/groupSheetRows";
import type { ReviewRow } from "@/types/review";

const baseRow = {
  stockName: "테스트",
  themeId: "theme-1",
  themeName: "대표 테마",
  features: {},
  manual: {
    entryType: "",
    reason: "",
    memo: "",
    reviewDone: "",
  },
};

describe("groupSheetRows", () => {
  it("keeps first group appearance order and sorts points by tradeTime", () => {
    const rows: ReviewRow[] = [
      {
        ...baseRow,
        reviewId: "a-2",
        rowNumber: 2,
        stockCode: "005930",
        tradeDate: "2026-05-29",
        tradeTime: "09:34",
      },
      {
        ...baseRow,
        reviewId: "b-1",
        rowNumber: 3,
        stockCode: "000660",
        tradeDate: "2026-05-29",
        tradeTime: "09:08",
      },
      {
        ...baseRow,
        reviewId: "a-1",
        rowNumber: 4,
        stockCode: "005930",
        tradeDate: "2026-05-29",
        tradeTime: "09:12",
      },
    ];

    const groups = groupSheetRows(rows);

    expect(groups.map((group) => group.groupKey)).toEqual([
      "005930|2026-05-29",
      "000660|2026-05-29",
    ]);
    expect(groups[0].points.map((point) => point.tradeTime)).toEqual(["09:12", "09:34"]);
  });
});
