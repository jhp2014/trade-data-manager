import { describe, expect, it } from "vitest";
import { computeThemeMemberMetrics, topByRate, type ThemeMemberMetric } from "@/lib/themeMetrics";
import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";
import type { ChartOverlayPoint, ChartOverlaySeries } from "@/types/chart";

function pt(time: number, valueNxt: number, amountEok: number, cumAmount = 0): ChartOverlayPoint {
  return { time, valueKrx: valueNxt, valueNxt, amount: amountEok * AMOUNT_KRW_TO_EOK, cumAmount };
}

function series(p: {
  stockCode?: string;
  isSelf?: boolean;
  isReviewTarget?: boolean;
  hasReview?: boolean;
  points: ChartOverlayPoint[];
}): ChartOverlaySeries {
  return {
    stockCode: p.stockCode ?? "005930",
    stockName: p.stockCode ?? "005930",
    isSelf: p.isSelf ?? false,
    isReviewTarget: p.isReviewTarget ?? false,
    hasReview: p.hasReview ?? false,
    series: p.points,
  } as unknown as ChartOverlaySeries;
}

describe("computeThemeMemberMetrics", () => {
  const points = [pt(100, 1, 25), pt(200, 5, 35), pt(300, 3, 10)];

  it("markerTime 시점까지의 rate·dayHigh·distribution 을 계산한다", () => {
    const [m] = computeThemeMemberMetrics([series({ points })], 200, "nxt", [20, 30]);
    expect(m.rate).toBe(5); // time<=200 의 마지막 = idx 1
    expect(m.dayHighRate).toBe(5); // 0..1 중 최고
    expect(m.distribution).toEqual({ 20: 2, 30: 1 }); // 25,35 ≥20 = 2개 / 35 ≥30 = 1개
  });

  it("markerTime 이 null 이면 마지막 시점을 쓴다", () => {
    const [m] = computeThemeMemberMetrics([series({ points })], null, "nxt", [20]);
    expect(m.rate).toBe(3); // 마지막 포인트
    expect(m.dayHighRate).toBe(5); // 전 구간 최고
  });

  it("markerTime 이전 포인트가 없으면 null/0", () => {
    const [m] = computeThemeMemberMetrics([series({ points })], 50, "nxt", [20]);
    expect(m.rate).toBeNull();
    expect(m.dayHighRate).toBeNull();
    expect(m.cumAmount).toBe(0);
    expect(m.distribution).toEqual({ 20: 0 });
  });
});

describe("topByRate", () => {
  const base = (stockCode: string, rate: number | null): ThemeMemberMetric =>
    ({ stockCode, rate } as ThemeMemberMetric);

  it("등락률 내림차순, null 은 뒤로, limit 적용", () => {
    const sorted = topByRate([base("a", 1), base("b", null), base("c", 9), base("d", 5)], 3);
    expect(sorted.map((m) => m.stockCode)).toEqual(["c", "d", "a"]);
  });
});
