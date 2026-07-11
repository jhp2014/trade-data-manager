import { describe, it, expect } from "vitest";
import { isCanonicalStockCode } from "../stockCode.js";

describe("isCanonicalStockCode", () => {
    it("표준형 — 6자리 숫자 + KRX 영숫자 코드", () => {
        expect(isCanonicalStockCode("005930")).toBe(true);
        expect(isCanonicalStockCode("000660")).toBe(true);
        expect(isCanonicalStockCode("0007C0")).toBe(true); // KRX 숫자고갈 영숫자
        expect(isCanonicalStockCode("0009K0")).toBe(true);
    });

    it("비표준 — 자리수/외부표현/소문자/공백/빈값", () => {
        expect(isCanonicalStockCode("5930")).toBe(false); // 앞0 생략(정규화는 ingestion 경계 몫)
        expect(isCanonicalStockCode("A005930")).toBe(false); // 조건검색 A접두
        expect(isCanonicalStockCode("005930_AL")).toBe(false); // 거래소 접미
        expect(isCanonicalStockCode("0007c0")).toBe(false); // 소문자(표준형은 대문자)
        expect(isCanonicalStockCode(" 005930")).toBe(false);
        expect(isCanonicalStockCode("")).toBe(false);
        expect(isCanonicalStockCode("HELLO!")).toBe(false);
    });
});
