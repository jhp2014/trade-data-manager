import { describe, expect, it } from "vitest";
import { buildExploredGroup } from "@/lib/buildExploredGroup";

describe("buildExploredGroup", () => {
  it("builds a review group from bundle review points", () => {
    const group = buildExploredGroup({
      stockCode: "005930",
      stockName: "삼성전자",
      tradeDate: "2026-05-27",
      lineTargets: [75000, 77000],
      reviewPoints: [
        {
          reviewId: "12",
          tradeTime: "10:30:00",
          payload: { tag: ["breakout", "volume"] },
        },
        {
          reviewId: "11",
          tradeTime: "09:12:00",
          payload: { result: "good" },
        },
      ],
    });

    expect(group.groupKey).toBe("005930|2026-05-27");
    expect(group.points.map((point) => point.tradeTime)).toEqual(["09:12", "10:30"]);
    expect(group.points[0].sourceRow.features.lineTargets).toBe("75000 | 77000");
    expect(group.points[1].sourceRow.manual.tag).toBe("breakout | volume");
  });

  it("creates a pending point when a review target has no points", () => {
    const group = buildExploredGroup({
      stockCode: "000660",
      stockName: "SK하이닉스",
      tradeDate: "2026-05-27",
      lineTargets: [],
      reviewPoints: [],
    });

    expect(group.points).toHaveLength(1);
    expect(group.points[0]).toMatchObject({
      pointKey: "pending:000660|2026-05-27|0",
      tradeTime: "",
      reviewId: "",
    });
  });
});
