import { describe, expect, it } from "vitest";
import {
  toNum,
  toNumOrNull,
  toInt,
  toBigInt,
  bigIntToString,
  dateToUnix,
  composeUnix,
} from "@/lib/serialization";

describe("toNum / toNumOrNull / toInt", () => {
  it("toNum 은 비정상/빈값을 0 으로", () => {
    expect(toNum("12")).toBe(12);
    expect(toNum(12n)).toBe(12);
    expect(toNum("")).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum("abc")).toBe(0);
  });
  it("toNumOrNull 은 비정상/빈값을 null 로", () => {
    expect(toNumOrNull("12.5")).toBe(12.5);
    expect(toNumOrNull("")).toBeNull();
    expect(toNumOrNull("abc")).toBeNull();
  });
  it("toInt 는 절삭", () => {
    expect(toInt("12.9")).toBe(12);
    expect(toInt(null)).toBeNull();
  });
});

describe("toBigInt / bigIntToString", () => {
  it("문자열/숫자/소수점을 bigint 로", () => {
    expect(toBigInt("100")).toBe(100n);
    expect(toBigInt(100)).toBe(100n);
    expect(toBigInt("100.9")).toBe(100n); // 소수점 절삭
    expect(toBigInt("")).toBeNull();
    expect(toBigInt("abc")).toBeNull();
  });
  it("bigIntToString", () => {
    expect(bigIntToString(100n)).toBe("100");
    expect(bigIntToString(null)).toBeNull();
  });
});

describe("dateToUnix (KST 기준)", () => {
  it("'YYYY-MM-DD' 를 KST 자정의 unix(초)로", () => {
    // 2026-05-27 00:00:00 KST == 2026-05-26 15:00:00 UTC
    const expected = Math.floor(Date.UTC(2026, 4, 26, 15, 0, 0) / 1000);
    expect(dateToUnix("2026-05-27")).toBe(expected);
  });
  it("비정상 입력은 0", () => {
    expect(dateToUnix(null)).toBe(0);
    expect(dateToUnix("")).toBe(0);
  });
});

describe("composeUnix (KST 기준)", () => {
  it("날짜+시각을 unix(초)로", () => {
    const expected = Math.floor(Date.UTC(2026, 4, 27, 0, 12, 0) / 1000); // 09:12 KST = 00:12 UTC
    expect(composeUnix("2026-05-27", "09:12:00")).toBe(expected);
  });
  it("빈 입력은 null", () => {
    expect(composeUnix("", "09:12:00")).toBeNull();
    expect(composeUnix("2026-05-27", "")).toBeNull();
  });
});
