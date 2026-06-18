import { describe, expect, it } from "vitest";
import {
    caseIdMatchesParts,
    composeCaseId,
    isValidCaseId,
    parseCaseId,
} from "@/domain/caseId";

describe("parseCaseId", () => {
    it("시각 포함 caseId 를 분해한다", () => {
        expect(parseCaseId("055550-2026-06-05-0911")).toEqual({
            stockCode: "055550",
            tradeDate: "2026-06-05",
            tradeTime: "09:11",
        });
    });

    it("시각 없는 groupId 형태를 허용한다", () => {
        expect(parseCaseId("055550-2026-06-05")).toEqual({
            stockCode: "055550",
            tradeDate: "2026-06-05",
            tradeTime: null,
        });
    });

    it("앞뒤 공백을 무시한다", () => {
        expect(parseCaseId("  055550-2026-06-05-0911  ")?.tradeTime).toBe("09:11");
    });

    it("형식이 어긋나면 null", () => {
        expect(parseCaseId("")).toBeNull();
        expect(parseCaseId("055550")).toBeNull();
        expect(parseCaseId("055550-20260605-0911")).toBeNull();
        expect(parseCaseId("055550-2026-06-05-911")).toBeNull(); // HHmm 자리수 부족
        expect(parseCaseId("garbage")).toBeNull();
    });

    it("월/일/시/분 범위를 벗어나면 null", () => {
        expect(parseCaseId("055550-2026-13-05")).toBeNull(); // month 13
        expect(parseCaseId("055550-2026-06-32")).toBeNull(); // day 32
        expect(parseCaseId("055550-2026-06-05-2460")).toBeNull(); // 24:60
        expect(parseCaseId("055550-2026-06-05-0999")).toBeNull(); // 09:99
    });
});

describe("isValidCaseId", () => {
    it("형식 판정", () => {
        expect(isValidCaseId("055550-2026-06-05-0911")).toBe(true);
        expect(isValidCaseId("055550-2026-06-05")).toBe(true);
        expect(isValidCaseId("nope")).toBe(false);
    });
});

describe("composeCaseId", () => {
    it("시각이 있으면 HHmm 을 붙인다", () => {
        expect(
            composeCaseId({ stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" }),
        ).toBe("055550-2026-06-05-0911");
    });

    it("HH:MM:SS 도 HHmm 으로 자른다", () => {
        expect(
            composeCaseId({ stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11:30" }),
        ).toBe("055550-2026-06-05-0911");
    });

    it("시각이 없으면 groupId 형태", () => {
        expect(composeCaseId({ stockCode: "055550", tradeDate: "2026-06-05" })).toBe(
            "055550-2026-06-05",
        );
        expect(
            composeCaseId({ stockCode: "055550", tradeDate: "2026-06-05", tradeTime: null }),
        ).toBe("055550-2026-06-05");
    });

    it("parse 와 round-trip 한다", () => {
        const id = "055550-2026-06-05-0911";
        const parts = parseCaseId(id)!;
        expect(composeCaseId(parts)).toBe(id);
    });
});

describe("caseIdMatchesParts", () => {
    it("컬럼들로 만든 caseId 가 일치하면 true", () => {
        expect(
            caseIdMatchesParts("055550-2026-06-05-0911", {
                stockCode: "055550",
                tradeDate: "2026-06-05",
                tradeTime: "09:11",
            }),
        ).toBe(true);
    });

    it("불일치면 false", () => {
        expect(
            caseIdMatchesParts("055550-2026-06-05-0911", {
                stockCode: "055550",
                tradeDate: "2026-06-05",
                tradeTime: "09:12",
            }),
        ).toBe(false);
    });
});
