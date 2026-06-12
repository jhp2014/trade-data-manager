import { describe, expect, it } from "vitest";
import { FEATURE_COLUMNS, type ReviewExportRow } from "@trade-data-manager/data-core";
import { buildSheetMatrix } from "@/lib/buildSheetMatrix";
import { FIXED_COLUMNS, toManualHeader } from "@/lib/sheetColumns";

describe("buildSheetMatrix", () => {
  it("builds fixed, feature, and manual columns in contract order", () => {
    const rows: ReviewExportRow[] = [
      {
        reviewId: "11",
        stockCode: "000660",
        stockName: "SK하이닉스",
        tradeDate: "2026-05-27",
        tradeTime: "09:04:00",
        lineTargets: [9010, 9450],
        features: {
          changeRate5m: "1.23",
          tradingAmount: "5000000000",
        },
        payload: {
          entryType: ["분봉 재돌파(S-V)", "분봉 재돌파(L-1)"],
          _done: "Y",
        },
      },
      {
        reviewId: null,
        stockCode: "009150",
        stockName: null,
        tradeDate: "2026-05-27",
        tradeTime: null,
        lineTargets: [],
        features: {},
        payload: {
          result: "관망",
        },
      },
    ];

    const matrix = buildSheetMatrix(rows);
    const header = matrix[0];

    expect(header.slice(0, FIXED_COLUMNS.length)).toEqual([...FIXED_COLUMNS]);
    expect(header.slice(FIXED_COLUMNS.length, FIXED_COLUMNS.length + FEATURE_COLUMNS.length))
      .toEqual([...FEATURE_COLUMNS]);
    expect(header.slice(FIXED_COLUMNS.length + FEATURE_COLUMNS.length)).toEqual([
      "m_done",
      "m_entryType",
      "m_result",
    ]);

    expect(matrix[1].slice(0, 7)).toEqual([
      "000660-2026-05-27",
      "11",
      "000660",
      "SK하이닉스",
      "2026-05-27",
      "09:04",
      "9010 | 9450",
    ]);
    expect(matrix[1][header.indexOf("changeRate5m")]).toBe("1.23");
    expect(matrix[1][header.indexOf("dayHighRate")]).toBe("");
    expect(matrix[1][header.indexOf("m_entryType")]).toBe("분봉 재돌파(S-V) | 분봉 재돌파(L-1)");
    expect(matrix[1][header.indexOf("m_done")]).toBe("Y");

    expect(matrix[2].slice(0, 7)).toEqual([
      "009150-2026-05-27",
      "",
      "009150",
      "",
      "2026-05-27",
      "",
      "",
    ]);
    expect(matrix[2][header.indexOf("m_result")]).toBe("관망");
    expect(matrix[2][header.indexOf("m_entryType")]).toBe("");
  });

  it("maps payload keys to manual headers", () => {
    expect(toManualHeader("_done")).toBe("m_done");
    expect(toManualHeader("entryType")).toBe("m_entryType");
  });

  it("projects only fieldKeys in given order when provided", () => {
    const rows: ReviewExportRow[] = [
      {
        reviewId: "11",
        stockCode: "000660",
        stockName: "SK하이닉스",
        tradeDate: "2026-05-27",
        tradeTime: "09:04:00",
        lineTargets: [9010, 9450],
        features: { changeRate5m: "1.23" },
        payload: { entryType: ["S-V", "L-1"] },
      },
    ];

    const matrix = buildSheetMatrix(rows, {
      fieldKeys: ["tradeTime", "m_entryType", "changeRate5m", "stockCode", "missingKey"],
    });

    // 헤더는 fieldKeys 그대로(없는 키 포함), 순서 유지.
    expect(matrix[0]).toEqual([
      "tradeTime",
      "m_entryType",
      "changeRate5m",
      "stockCode",
      "missingKey",
    ]);
    // 데이터는 키별 해당 값, 매칭 안 되는 키는 빈 컬럼.
    expect(matrix[1]).toEqual(["09:04", "S-V | L-1", "1.23", "000660", ""]);
  });

  it("falls back to full columns when fieldKeys is empty", () => {
    const rows: ReviewExportRow[] = [
      {
        reviewId: "11",
        stockCode: "000660",
        stockName: "SK하이닉스",
        tradeDate: "2026-05-27",
        tradeTime: "09:04:00",
        lineTargets: [],
        features: {},
        payload: {},
      },
    ];

    const full = buildSheetMatrix(rows);
    const empty = buildSheetMatrix(rows, { fieldKeys: [] });
    expect(empty).toEqual(full);
  });
});
