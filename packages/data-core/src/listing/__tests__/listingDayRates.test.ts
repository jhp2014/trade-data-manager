import { describe, expect, it } from "vitest";
import { isListingDay, fillListingDayRates } from "../listingDayRates";
import type { MinuteCandle } from "../../schema/market";

/** fillListingDayRates 가 읽는 필드만 채운 최소 분봉(나머지는 캐스팅). */
function candle(p: Partial<MinuteCandle>): MinuteCandle {
  return {
    open: "1000",
    high: "1100",
    low: "900",
    close: "1050",
    openRateKrx: null,
    highRateKrx: null,
    lowRateKrx: null,
    closeRateKrx: null,
    openRateNxt: null,
    highRateNxt: null,
    lowRateNxt: null,
    closeRateNxt: null,
    ...p,
  } as MinuteCandle;
}

describe("isListingDay", () => {
  it("regDay 와 tradeDate 가 같으면 true", () => {
    expect(isListingDay("2026-05-27", "2026-05-27")).toBe(true);
  });
  it("다르거나 null 이면 false", () => {
    expect(isListingDay("2026-05-26", "2026-05-27")).toBe(false);
    expect(isListingDay(null, "2026-05-27")).toBe(false);
    expect(isListingDay(undefined, "2026-05-27")).toBe(false);
  });
});

describe("fillListingDayRates", () => {
  it("빈 배열은 그대로", () => {
    expect(fillListingDayRates([])).toEqual([]);
  });

  it("첫 분봉 open 기준 %로 null 등락률을 채운다(KRX/NXT 동일)", () => {
    const [c] = fillListingDayRates([candle({ open: "1000", high: "1100", low: "900", close: "1050" })]);
    expect(c.closeRateKrx).toBe("5.0000");
    expect(c.highRateKrx).toBe("10.0000");
    expect(c.lowRateKrx).toBe("-10.0000");
    expect(c.closeRateNxt).toBe("5.0000"); // 상장일엔 KRX/NXT 동일 기준
  });

  it("이미 값이 있는 등락률은 보존한다(멱등)", () => {
    const [c] = fillListingDayRates([candle({ open: "1000", close: "1050", closeRateKrx: "99.0000" })]);
    expect(c.closeRateKrx).toBe("99.0000");
  });

  it("첫 분봉 open 이 0/비정상이면 계산 불가로 원본을 그대로 반환", () => {
    const input = [candle({ open: "0" })];
    expect(fillListingDayRates(input)).toBe(input); // 동일 참조
  });
});
