import { describe, it, expect } from "vitest";
import { isValidYearMonth, enumerateMonthDates } from "../yearMonth.js";

describe("isValidYearMonth", () => {
    it("유효 년월", () => {
        expect(isValidYearMonth("2026-06")).toBe(true);
        expect(isValidYearMonth("2000-01")).toBe(true);
        expect(isValidYearMonth("2100-12")).toBe(true);
    });
    it("형식·범위 불량", () => {
        expect(isValidYearMonth("2026-13")).toBe(false); // 월 범위
        expect(isValidYearMonth("2026-00")).toBe(false);
        expect(isValidYearMonth("26-06")).toBe(false); // 형식
        expect(isValidYearMonth("2026-6")).toBe(false);
        expect(isValidYearMonth("2026/06")).toBe(false);
        expect(isValidYearMonth("1999-06")).toBe(false); // 연 하한
        expect(isValidYearMonth("2101-06")).toBe(false); // 연 상한
    });
});

describe("enumerateMonthDates", () => {
    it("31일 달", () => {
        const d = enumerateMonthDates("2026-01");
        expect(d).toHaveLength(31);
        expect(d[0]).toBe("2026-01-01");
        expect(d[30]).toBe("2026-01-31");
    });
    it("윤년/평년 2월", () => {
        expect(enumerateMonthDates("2024-02")).toHaveLength(29); // 윤년
        expect(enumerateMonthDates("2025-02")).toHaveLength(28);
    });
    it("30일 달 말일", () => {
        const d = enumerateMonthDates("2026-06");
        expect(d).toHaveLength(30);
        expect(d[d.length - 1]).toBe("2026-06-30");
    });
    it("불량 년월은 throw", () => {
        expect(() => enumerateMonthDates("2026-13")).toThrow();
        expect(() => enumerateMonthDates("nope")).toThrow();
    });
});
