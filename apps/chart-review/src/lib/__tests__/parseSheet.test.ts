import { describe, expect, it, vi } from "vitest";
import { parseSheetValues } from "@/lib/parseSheet";

describe("parseSheetValues", () => {
  it("classifies fixed, feature, and manual columns", () => {
    const rows = parseSheetValues([
      ["reviewId", "stockCode", "stockName", "tradeDate", "tradeTime", "lineTargets", "changeRate5m", "m_entryType", "m_done"],
      ["11", "000660", "SK하이닉스", "2026-05-27", "09:04:00", "9010 | 9450", "1.2", "돌파", "Y"],
    ]);

    expect(rows).toEqual([
      {
        reviewId: "11",
        rowNumber: 2,
        stockCode: "000660",
        stockName: "SK하이닉스",
        tradeDate: "2026-05-27",
        tradeTime: "09:04",
        features: {
          lineTargets: "9010 | 9450",
          changeRate5m: "1.2",
        },
        manual: {
          entryType: "돌파",
          done: "Y",
        },
      },
    ]);
  });

  it("keeps pending rows with empty tradeTime and reviewId", () => {
    const rows = parseSheetValues([
      ["stockCode", "tradeDate", "tradeTime", "reviewId"],
      ["009150", "2026.5.7", "", ""],
    ]);

    expect(rows[0].reviewId).toBe("");
    expect(rows[0].tradeDate).toBe("2026-05-07");
    expect(rows[0].tradeTime).toBe("");
  });

  it("normalizes spreadsheet serial time values", () => {
    const rows = parseSheetValues([
      ["stockCode", "tradeDate", "tradeTime"],
      ["009150", "2026-05-27", String((9 * 60 + 34) / (24 * 60))],
    ]);

    expect(rows[0].tradeTime).toBe("09:34");
  });

  it("throws when required headers are missing", () => {
    expect(() => parseSheetValues([["stockCode"], ["000660"]])).toThrow(
      "[sheet] required column missing: tradeDate",
    );
  });

  it("skips blank rows and rows missing required data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rows = parseSheetValues([
      ["stockCode", "tradeDate", "tradeTime"],
      ["", "", ""],
      ["000660", "", "09:04"],
      ["000660", "2026-05-27", "09:04"],
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(4);
    expect(warn).toHaveBeenCalledWith("[sheet] skip row 3: stockCode/tradeDate is required");
    warn.mockRestore();
  });
});
