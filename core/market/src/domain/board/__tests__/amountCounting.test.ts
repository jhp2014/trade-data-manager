import { describe, it, expect } from "vitest";
import { countAmountBuckets, DEFAULT_COUNTING_POLICY, type DerivedMinute } from "../amount.js";
import { topHighsInWindow, isNearWindowHigh } from "../trailing.js";

describe("countAmountBuckets", () => {
    // 10:00, 양봉(종가%>시가%), 35억 → 구간0. minuteOfDay 600.
    const bull: DerivedMinute = { minuteOfDay: 600, openPct: 5, highPct: 10, closePct: 8, amountWon: 3.5e9 };
    const sum = (c: number[]) => c.reduce((a, b) => a + b, 0);

    it("양봉 35억 → 구간0 카운트", () => {
        expect(countAmountBuckets([bull])).toEqual([1, 0, 0, 0, 0, 0, 0]);
    });
    it("시간 창 밖(15:30·07:59)은 제외", () => {
        expect(sum(countAmountBuckets([{ ...bull, minuteOfDay: 930 }]))).toBe(0); // 15:30
        expect(sum(countAmountBuckets([{ ...bull, minuteOfDay: 479 }]))).toBe(0); // 07:59
    });
    it("창 경계(08:00=480, 15:20=920)는 포함", () => {
        expect(sum(countAmountBuckets([{ ...bull, minuteOfDay: 480 }]))).toBe(1);
        expect(sum(countAmountBuckets([{ ...bull, minuteOfDay: 920 }]))).toBe(1);
    });
    it("30억 미만은 구간 없음(제외)", () => {
        expect(sum(countAmountBuckets([{ ...bull, amountWon: 2.5e9 }]))).toBe(0);
    });
    it("꼬리 없는 음봉(고가%−시가% ≤1)은 제외", () => {
        // 종가%<시가%, 고가%−시가% = 0.5 ≤ 1 → 제외
        expect(sum(countAmountBuckets([{ ...bull, openPct: 5, highPct: 5.5, closePct: 3 }]))).toBe(0);
    });
    it("윗꼬리 있는 음봉(고가%−시가% >1)은 카운트", () => {
        // 종가%<시가%지만 고가%−시가% = 2 > 1 → 매수 시도 있었음
        expect(sum(countAmountBuckets([{ ...bull, openPct: 5, highPct: 7, closePct: 3 }]))).toBe(1);
    });
    it("정책 off 면 음봉도 카운트", () => {
        const policy = { ...DEFAULT_COUNTING_POLICY, excludeBearishNoWick: { enabled: false, maxUpperWickPct: 1 } };
        expect(sum(countAmountBuckets([{ ...bull, openPct: 5, highPct: 5.5, closePct: 3 }], policy))).toBe(1);
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
