import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { assertYmd, assertHms, assertStockCode, assertFilterExpr } from "../validation.js";

describe("assertYmd", () => {
    it("유효 날짜는 그대로 반환", () => {
        expect(assertYmd("2026-06-26")).toBe("2026-06-26");
    });
    it("형식/필수/달력 유효성 위반은 400", () => {
        expect(() => assertYmd(undefined)).toThrow(BadRequestException);
        expect(() => assertYmd("2026-6-2")).toThrow(BadRequestException); // 자리수
        expect(() => assertYmd("2026-13-01")).toThrow(BadRequestException); // 월 롤오버
        expect(() => assertYmd("2026-02-30")).toThrow(BadRequestException); // 일 롤오버
    });
});

describe("assertHms", () => {
    it("유효 시각은 그대로 반환", () => {
        expect(assertHms("09:00:00")).toBe("09:00:00");
        expect(assertHms("23:59:59")).toBe("23:59:59");
    });
    it("형식/시각 상한 위반은 400", () => {
        expect(() => assertHms(undefined)).toThrow(BadRequestException);
        expect(() => assertHms("9:0:0")).toThrow(BadRequestException);
        expect(() => assertHms("24:00:00")).toThrow(BadRequestException);
        expect(() => assertHms("09:60:00")).toThrow(BadRequestException);
    });
});

describe("assertStockCode", () => {
    it("표준형은 그대로 반환(KRX 영숫자 포함)", () => {
        expect(assertStockCode("005930")).toBe("005930");
        expect(assertStockCode("0007C0")).toBe("0007C0"); // KRX 숫자고갈 영숫자 코드
    });
    it("비표준 표현은 보정 없이 400 — 정규화는 ingestion 경계의 몫", () => {
        expect(() => assertStockCode(undefined)).toThrow(BadRequestException);
        expect(() => assertStockCode("")).toThrow(BadRequestException);
        expect(() => assertStockCode("5930")).toThrow(BadRequestException); // 앞0 생략
        expect(() => assertStockCode("A005930")).toThrow(BadRequestException); // A접두
        expect(() => assertStockCode("005930_AL")).toThrow(BadRequestException); // 거래소 접미
        expect(() => assertStockCode("hello")).toThrow(BadRequestException);
    });
    it("field 이름이 에러 메시지에 반영", () => {
        expect(() => assertStockCode(undefined, "stockCode")).toThrow(/stockCode/);
    });
});

describe("assertFilterExpr", () => {
    it("유효 DNF 는 재조립해 반환", () => {
        const expr = { groups: [[{ hypothesisId: "1", negated: false }, { hypothesisId: "2", negated: true }], [{ hypothesisId: "3", negated: false }]] };
        expect(assertFilterExpr(expr)).toEqual(expr);
    });

    it("빈 groups 는 유효(필터 없음)", () => {
        expect(assertFilterExpr({ groups: [] })).toEqual({ groups: [] });
    });

    it("리프의 여분 키는 제거(jsonb 오염 방지)", () => {
        const dirty = { groups: [[{ hypothesisId: "1", negated: false, junk: "x", extra: 42 }]] };
        expect(assertFilterExpr(dirty)).toEqual({ groups: [[{ hypothesisId: "1", negated: false }]] });
    });

    it("hypothesisId 는 trim", () => {
        expect(assertFilterExpr({ groups: [[{ hypothesisId: "  7 ", negated: false }]] })).toEqual({
            groups: [[{ hypothesisId: "7", negated: false }]],
        });
    });

    it("구조/리프 위반은 400", () => {
        expect(() => assertFilterExpr(null)).toThrow(BadRequestException);
        expect(() => assertFilterExpr({})).toThrow(BadRequestException); // groups 없음
        expect(() => assertFilterExpr({ groups: "x" })).toThrow(BadRequestException); // groups 비배열
        expect(() => assertFilterExpr({ groups: [{}] })).toThrow(BadRequestException); // 그룹 비배열
        expect(() => assertFilterExpr({ groups: [[{ negated: false }]] })).toThrow(BadRequestException); // id 없음
        expect(() => assertFilterExpr({ groups: [[{ hypothesisId: "  ", negated: false }]] })).toThrow(BadRequestException); // 빈 id
        expect(() => assertFilterExpr({ groups: [[{ hypothesisId: "1", negated: "yes" }]] })).toThrow(BadRequestException); // negated 비boolean
        expect(() => assertFilterExpr({ groups: [[{ hypothesisId: "1" }]] })).toThrow(BadRequestException); // negated 없음
    });
});
