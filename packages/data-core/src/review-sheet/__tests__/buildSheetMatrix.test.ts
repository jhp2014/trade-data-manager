import { describe, expect, it } from "vitest";
import { buildSheetMatrix } from "../buildSheetMatrix";
import { FEATURE_COLUMNS, FIXED_COLUMNS, toManualHeader } from "../columns";
import type { ReviewExportRow } from "../buildSheetMatrix";

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
});
