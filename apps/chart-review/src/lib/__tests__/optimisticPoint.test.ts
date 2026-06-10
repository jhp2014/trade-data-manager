import { describe, expect, it } from "vitest";
import { upsertPointInGroups, removePointFromGroups } from "@/lib/optimisticPoint";
import { toReviewPoint } from "@/lib/groupSheetRows";
import type { ReviewStockGroup, SheetPointRow } from "@/types/review";

function makeGroup(rows: SheetPointRow[]): ReviewStockGroup {
  const first = rows[0];
  return {
    groupKey: `${first.stockCode}|${first.tradeDate}`,
    stockCode: first.stockCode,
    stockName: first.stockName,
    tradeDate: first.tradeDate,
    points: rows.map(toReviewPoint),
  };
}

const baseRow = (over: Partial<SheetPointRow>): SheetPointRow => ({
  reviewId: "",
  rowNumber: 0,
  stockCode: "005930",
  stockName: "삼성전자",
  tradeDate: "2026-06-08",
  tradeTime: "",
  features: {},
  manual: {},
  ...over,
});

describe("upsertPointInGroups", () => {
  it("inherits lineTargets onto a brand-new point so the price line survives", () => {
    // 타점이 없는 종목: lineTargets 를 든 placeholder 1개만 존재.
    const group = makeGroup([
      baseRow({ reviewId: "", tradeTime: "", features: { lineTargets: "9010 | 9450" } }),
    ]);

    const next = upsertPointInGroups([group], {
      stockCode: "005930",
      tradeDate: "2026-06-08",
      tradeTime: "09:30",
      reviewId: "rev-1",
      payload: { result: "good" },
    });

    const points = next[0].points;
    expect(points).toHaveLength(1);
    expect(points[0].reviewId).toBe("rev-1");
    // 핵심: placeholder 가 사라져도 lineTargets 가 새 점에 이어진다.
    expect(points[0].sourceRow.features.lineTargets).toBe("9010 | 9450");
    expect(points[0].sourceRow.manual).toEqual({ result: "good" });
  });

  it("keeps features when editing an existing point at the same time", () => {
    const group = makeGroup([
      baseRow({
        reviewId: "rev-1",
        tradeTime: "09:30",
        features: { lineTargets: "9010 | 9450", amountText: "1.2억" },
        manual: { result: "watch" },
      }),
    ]);

    const next = upsertPointInGroups([group], {
      stockCode: "005930",
      tradeDate: "2026-06-08",
      tradeTime: "09:30",
      reviewId: "rev-1",
      payload: { result: "good" },
    });

    const point = next[0].points[0];
    expect(point.sourceRow.features).toEqual({ lineTargets: "9010 | 9450", amountText: "1.2억" });
    expect(point.sourceRow.manual).toEqual({ result: "good" });
  });

  it("leaves features empty when the group has no lineTargets", () => {
    const group = makeGroup([baseRow({ reviewId: "", tradeTime: "", features: {} })]);

    const next = upsertPointInGroups([group], {
      stockCode: "005930",
      tradeDate: "2026-06-08",
      tradeTime: "09:30",
      reviewId: "rev-1",
      payload: { result: "good" },
    });

    expect(next[0].points[0].sourceRow.features).toEqual({});
  });
});
