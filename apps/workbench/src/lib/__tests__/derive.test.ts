import { describe, it, expect } from "vitest";
import { prevCloseAsOf, type DailyPoint } from "../derive.js";

const dp = (time: string, close: number): DailyPoint => ({ time, open: close, high: close, low: close, close, amount: 0, prevClose: null });

describe("prevCloseAsOf", () => {
    const points = [dp("2026-07-08", 100), dp("2026-07-09", 110), dp("2026-07-10", 120)];

    it("검색일 봉이 있으면 직전 봉 종가", () => {
        expect(prevCloseAsOf(points, "2026-07-10")).toBe(110);
        expect(prevCloseAsOf(points, "2026-07-09")).toBe(100);
    });

    it("검색일 봉이 없어도(주말·장전) 직전 거래일 종가", () => {
        expect(prevCloseAsOf(points, "2026-07-12")).toBe(120); // 일요일 → 금요일 종가
        expect(prevCloseAsOf(points, "2026-07-13")).toBe(120); // 장전 오늘봉 미형성
    });

    it("첫 봉 이전이면 null", () => {
        expect(prevCloseAsOf(points, "2026-07-08")).toBeNull();
        expect(prevCloseAsOf(points, "2026-07-01")).toBeNull();
        expect(prevCloseAsOf([], "2026-07-10")).toBeNull();
    });
});
