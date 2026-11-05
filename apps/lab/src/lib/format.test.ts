import { describe, expect, it } from "vitest";
import { fmtEok, fmtEokValue, fmtMarketCap } from "./format.js";

describe("시가총액 억/조", () => {
    it("1조 미만은 억(쉼표), 1조 이상은 조(소수 한 자리 고정)", () => {
        expect(fmtMarketCap("42300000000")).toBe("423억");
        expect(fmtMarketCap("123400000000")).toBe("1,234억");
        expect(fmtMarketCap("1234000000000")).toBe("1.2조");
        expect(fmtMarketCap("1000000000000")).toBe("1.0조");
        expect(fmtMarketCap("13800000000000")).toBe("13.8조");
        expect(fmtMarketCap("512340000000000")).toBe("512.3조");
    });
    it("경계는 반올림한 값으로 — 9999.6억 = 1.0조(10,000억 이 아니다)", () => {
        expect(fmtMarketCap("999960000000")).toBe("1.0조");
        expect(fmtMarketCap("999940000000")).toBe("9,999억");
    });
});

describe("거래대금 억/조 — 축·툴팁·종목 줄이 같은 규칙", () => {
    it("1조 이상은 조(소수 한 자리, .0 은 뗀다), 아래는 억(쉼표), 1억 미만은 소수 한 자리", () => {
        expect(fmtEokValue(15000)).toBe("1.5조");
        expect(fmtEokValue(10000)).toBe("1조");
        expect(fmtEokValue(123456)).toBe("12.3조");
        expect(fmtEokValue(5000)).toBe("5,000억");
        expect(fmtEokValue(37.4)).toBe("37억");
        expect(fmtEokValue(0.4)).toBe("0.4억");
        expect(fmtEokValue(0)).toBe("0억");
    });
    it("경계는 반올림한 값으로 — 9999.6억 = 1조(10,000억 이 아니다)", () => {
        expect(fmtEokValue(9999.6)).toBe("1조");
        expect(fmtEokValue(9999.4)).toBe("9,999억");
        expect(fmtEokValue(0.96)).toBe("1억");
    });
    it("원 → 억/조", () => {
        expect(fmtEok(1.5e12)).toBe("1.5조");
        expect(fmtEok(5e11)).toBe("5,000억");
    });
});
