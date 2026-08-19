import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { assertYmd, assertHms, assertStockCode, assertName, assertOptionalText, isUniqueViolation, rejectDuplicateName } from "../validation.js";

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

describe("assertName", () => {
    it("앞뒤 공백은 깎아서 반환 — 유니크 제약 우회('돌파 '≠'돌파') 방지", () => {
        expect(assertName(" 돌파 ")).toBe("돌파");
    });
    it("필수·공백만·비문자열은 400", () => {
        expect(() => assertName(undefined)).toThrow(BadRequestException);
        expect(() => assertName("   ")).toThrow(BadRequestException);
        expect(() => assertName(42)).toThrow(BadRequestException);
    });
});

describe("assertOptionalText", () => {
    it("안 주면(undefined/null) undefined 로 통과 — 선택 필드", () => {
        expect(assertOptionalText(undefined, "memo", 10)).toBeUndefined();
        expect(assertOptionalText(null, "memo", 10)).toBeUndefined();
    });
    it("주면 문자열 타입 + 길이 상한", () => {
        expect(assertOptionalText("메모", "memo", 10)).toBe("메모");
        expect(() => assertOptionalText(42, "memo", 10)).toThrow(BadRequestException);
        expect(() => assertOptionalText({ a: 1 }, "memo", 10)).toThrow(BadRequestException);
        expect(() => assertOptionalText("x".repeat(11), "memo", 10)).toThrow(BadRequestException);
    });
});

describe("unique 충돌 → 400", () => {
    // drizzle 은 pg 에러를 DrizzleQueryError 로 감싼다(cause 사슬) — 겉·속 어디 있어도 잡혀야 한다.
    const pgUnique = Object.assign(new Error("duplicate key value"), { code: "23505" });

    it("cause 사슬을 따라 23505 를 찾는다", () => {
        expect(isUniqueViolation(pgUnique)).toBe(true);
        expect(isUniqueViolation(new Error("wrap", { cause: pgUnique }))).toBe(true);
        expect(isUniqueViolation(new Error("다른 고장"))).toBe(false);
        expect(isUniqueViolation(Object.assign(new Error("fk"), { code: "23503" }))).toBe(false);
    });

    it("rejectDuplicateName — unique 충돌만 400, 다른 예외는 그대로(DB 고장을 400 으로 감추지 않는다)", async () => {
        await expect(rejectDuplicateName(() => Promise.reject(new Error("wrap", { cause: pgUnique })), "돌파")).rejects.toThrow(
            BadRequestException,
        );
        await expect(rejectDuplicateName(() => Promise.reject(new Error("연결 끊김")), "돌파")).rejects.toThrow("연결 끊김");
        await expect(rejectDuplicateName(() => Promise.resolve("ok"), "돌파")).resolves.toBe("ok");
    });
});
