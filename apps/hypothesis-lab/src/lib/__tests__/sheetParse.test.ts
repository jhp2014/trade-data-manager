import { describe, expect, it } from "vitest";
import { parseSheetCaseIds } from "@/lib/sheetParse";

const HEADER = ["stockCode", "stockName", "tradeDate", "tradeTime"];

describe("parseSheetCaseIds", () => {
    it("빈 시트는 빈 배열", () => {
        expect(parseSheetCaseIds([])).toEqual([]);
    });

    it("행에서 caseId 를 조합한다", () => {
        const values = [
            HEADER,
            ["055550", "신한지주", "2026-06-05", "09:11"],
            ["005930", "삼성전자", "2026-06-10", "13:20"],
        ];
        expect(parseSheetCaseIds(values)).toEqual([
            "055550-2026-06-05-0911",
            "005930-2026-06-10-1320",
        ]);
    });

    it("tradeTime 이 없으면 groupId 형태", () => {
        const values = [
            ["stockCode", "tradeDate"],
            ["055550", "2026-06-05"],
        ];
        expect(parseSheetCaseIds(values)).toEqual(["055550-2026-06-05"]);
    });

    it("날짜 구분자(/ .)와 한자리 월/일을 정규화한다", () => {
        const values = [
            ["stockCode", "tradeDate", "tradeTime"],
            ["055550", "2026/6/5", "9:11"],
        ];
        expect(parseSheetCaseIds(values)).toEqual(["055550-2026-06-05-0911"]);
    });

    it("stockCode/tradeDate 가 빈 행은 건너뛴다", () => {
        const values = [
            HEADER,
            ["", "", "", ""],
            ["055550", "신한지주", "2026-06-05", "09:11"],
            ["", "이름만", "", ""],
        ];
        expect(parseSheetCaseIds(values)).toEqual(["055550-2026-06-05-0911"]);
    });

    it("중복 caseId 는 한 번만(순서 보존)", () => {
        const values = [
            HEADER,
            ["055550", "신한지주", "2026-06-05", "09:11"],
            ["055550", "신한지주", "2026-06-05", "09:11"],
            ["005930", "삼성전자", "2026-06-10", "13:20"],
        ];
        expect(parseSheetCaseIds(values)).toEqual([
            "055550-2026-06-05-0911",
            "005930-2026-06-10-1320",
        ]);
    });

    it("필수 컬럼이 없으면 throw", () => {
        expect(() => parseSheetCaseIds([["stockName", "tradeTime"]])).toThrow(/required column/);
    });
});
