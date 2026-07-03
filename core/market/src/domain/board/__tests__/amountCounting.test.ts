import { describe, it, expect } from "vitest";
import { shouldCountMinute, DEFAULT_COUNTING_POLICY } from "../amount.js";
import { topHighsInWindow, isNearWindowHigh } from "../trailing.js";

describe("shouldCountMinute", () => {
    const bull = { time: "10:00", open: 1000, high: 1100, low: 990, close: 1080 }; // 양봉

    it("시간 창 밖(15:30 종가단일가)은 제외", () => {
        expect(shouldCountMinute({ ...bull, time: "15:30" })).toBe(false);
    });
    it("시간 창 밖(08:00 이전)은 제외", () => {
        expect(shouldCountMinute({ ...bull, time: "07:59" })).toBe(false);
    });
    it("창 경계(08:00, 15:20)는 포함", () => {
        expect(shouldCountMinute({ ...bull, time: "08:00" })).toBe(true);
        expect(shouldCountMinute({ ...bull, time: "15:20" })).toBe(true);
    });
    it("양봉은 카운트", () => {
        expect(shouldCountMinute(bull)).toBe(true);
    });
    it("꼬리 없는 음봉(윗꼬리 ≤1%)은 제외", () => {
        // 종가<시가, 고가=시가(윗꼬리 0%)
        expect(shouldCountMinute({ time: "10:00", open: 1000, high: 1005, low: 950, close: 960 })).toBe(false);
    });
    it("윗꼬리 있는 음봉(>1%)은 카운트", () => {
        // 종가<시가지만 고가가 시가보다 2% 위 → 매수 시도 있었음
        expect(shouldCountMinute({ time: "10:00", open: 1000, high: 1020, low: 950, close: 960 })).toBe(true);
    });
    it("정책 off 면 음봉도 카운트", () => {
        const policy = { ...DEFAULT_COUNTING_POLICY, excludeBearishNoWick: { enabled: false, maxUpperWickPct: 1 } };
        expect(shouldCountMinute({ time: "10:00", open: 1000, high: 1005, low: 950, close: 960 }, policy)).toBe(true);
    });
});

describe("topHighsInWindow", () => {
    // index=daysAgo, 값=high%. 0=당일.
    const highs = [18, 5, 9, 22, 3, 7, 12, 30, 4, 11];

    it("20창(전체) top-4 = high% 내림차순", () => {
        expect(topHighsInWindow(highs, 20, 4)).toEqual([
            { daysAgo: 7, highPct: 30 },
            { daysAgo: 3, highPct: 22 },
            { daysAgo: 0, highPct: 18 },
            { daysAgo: 6, highPct: 12 },
        ]);
    });
    it("작은 창(0..2)은 앞부분만 — 창 밖 30·22 제외", () => {
        expect(topHighsInWindow(highs, 3, 4)).toEqual([
            { daysAgo: 0, highPct: 18 },
            { daysAgo: 2, highPct: 9 },
            { daysAgo: 1, highPct: 5 },
        ]);
    });
    it("당일이 최고면 1등이 daysAgo 0", () => {
        expect(topHighsInWindow([25, 5, 22], 3, 1)).toEqual([{ daysAgo: 0, highPct: 25 }]);
    });
    it("동률은 더 최근(daysAgo 작은) 우선", () => {
        expect(topHighsInWindow([10, 10, 3], 3, 2)).toEqual([
            { daysAgo: 0, highPct: 10 },
            { daysAgo: 1, highPct: 10 },
        ]);
    });
    it("배열이 창보다 짧으면 있는 만큼", () => {
        expect(topHighsInWindow([7, 3], 20, 4)).toEqual([
            { daysAgo: 0, highPct: 7 },
            { daysAgo: 1, highPct: 3 },
        ]);
    });
});

describe("isNearWindowHigh", () => {
    it("당일이 창 최고가면 true(갭 0)", () => {
        expect(isNearWindowHigh([25, 10, 22], 3, 2)).toBe(true);
    });
    it("당일이 최고가의 2% 이내(아래)면 true", () => {
        // 창최고 22(3일전), 당일 20.5 → 갭 1.5 ≤ 2
        expect(isNearWindowHigh([20.5, 5, 22], 3, 2)).toBe(true);
    });
    it("당일이 최고가보다 2% 넘게 아래면 false(고점 이탈)", () => {
        // 창최고 22, 당일 18 → 갭 4 > 2
        expect(isNearWindowHigh([18, 5, 22], 3, 2)).toBe(false);
    });
    it("창 밖(20일 이후)의 더 높은 고가는 무시", () => {
        // 당일 18, 창(0..2) 최고 22 → 갭 4 > 2 → false. index3 의 30 은 창 밖이라 영향 없음
        expect(isNearWindowHigh([18, 5, 22, 30], 3, 2)).toBe(false);
    });
    it("빈 배열(데이터 없음)은 false", () => {
        expect(isNearWindowHigh([], 20, 2)).toBe(false);
    });
});
