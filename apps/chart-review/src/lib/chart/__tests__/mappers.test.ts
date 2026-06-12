import { describe, expect, it } from "vitest";
import { toDailyChartCandle, buildMinuteCandles, buildOverlayPoints } from "@/lib/chart/mappers";
import type {
  DailyCandle as DailyRow,
  MinuteCandle as MinuteRow,
  MinuteCandleFeatures as FeatureRow,
} from "@trade-data-manager/data-core";

function dailyRow(o: Partial<DailyRow>): DailyRow {
  return {
    tradeDate: "2026-05-27",
    openKrx: "1000", highKrx: "1100", lowKrx: "900", closeKrx: "1050",
    openNxt: "1000", highNxt: "1100", lowNxt: "900", closeNxt: "1050",
    tradingVolumeKrx: 10n, tradingAmountKrx: "100",
    tradingVolumeNxt: 20n, tradingAmountNxt: "200",
    prevCloseKrx: null, prevCloseNxt: null,
    ...o,
  } as unknown as DailyRow;
}

function minuteRow(o: Partial<MinuteRow>): MinuteRow {
  return {
    unixTimestamp: 1000,
    tradeTime: "09:12:00",
    tradingVolume: 5n, tradingAmount: "50", accumulatedTradingAmount: "500",
    openRateKrx: "1", highRateKrx: "2", lowRateKrx: "0", closeRateKrx: "1.5",
    openRateNxt: "1", highRateNxt: "2", lowRateNxt: "0", closeRateNxt: "1.6",
    ...o,
  } as unknown as MinuteRow;
}

describe("toDailyChartCandle", () => {
  it("문자열 숫자를 number 로 변환하고 prevClose 는 null 이면 undefined", () => {
    const c = toDailyChartCandle(dailyRow({ closeKrx: "1050", prevCloseKrx: null, prevCloseNxt: "990" }));
    expect(c.krx.close).toBe(1050);
    expect(c.prevCloseKrx).toBeUndefined();
    expect(c.prevCloseNxt).toBe(990);
  });
});

describe("buildMinuteCandles", () => {
  it("KRX/NXT 양쪽 다 null 인 봉은 제외", () => {
    const rows = [
      minuteRow({ tradeTime: "09:00:00" }),
      minuteRow({
        tradeTime: "09:01:00",
        openRateKrx: null, highRateKrx: null, lowRateKrx: null, closeRateKrx: null,
        openRateNxt: null, highRateNxt: null, lowRateNxt: null, closeRateNxt: null,
      }),
    ];
    expect(buildMinuteCandles(rows)).toHaveLength(1);
  });

  it("한쪽만 null 이면 그쪽은 0 으로 채운다", () => {
    const [c] = buildMinuteCandles([
      minuteRow({ openRateKrx: null, highRateKrx: null, lowRateKrx: null, closeRateKrx: null }),
    ]);
    expect(c.krx).toEqual({ open: 0, high: 0, low: 0, close: 0 });
    expect(c.nxt.close).toBe(1.6);
  });
});

describe("buildOverlayPoints", () => {
  it("feature 의 누적거래대금을 시각으로 매칭하고 time 오름차순 정렬", () => {
    const minute = [
      minuteRow({ unixTimestamp: 200, tradeTime: "09:02:00", closeRateNxt: "2" }),
      minuteRow({ unixTimestamp: 100, tradeTime: "09:01:00", closeRateNxt: "1" }),
    ];
    const features = [
      { tradeTime: "09:01:00", cumulativeTradingAmount: "111" },
      { tradeTime: "09:02:00", cumulativeTradingAmount: "222" },
    ] as unknown as FeatureRow[];

    const pts = buildOverlayPoints(minute, features);
    expect(pts.map((p) => p.time)).toEqual([100, 200]); // 정렬됨
    expect(pts[0].cumAmount).toBe(111);
    expect(pts[1].cumAmount).toBe(222);
  });
});
