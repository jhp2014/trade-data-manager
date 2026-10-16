import { describe, expect, it } from "vitest";
import { indexAtOrBefore, minutesOfDay, snapToBar, stepMinute } from "./bars.js";
import { amountBucketIndex } from "./chartUtils.js";

const bars = [{ time: 100 }, { time: 160 }, { time: 220 }];

describe("snapToBar", () => {
    it("target 이하 마지막 봉", () => {
        expect(snapToBar(bars, 100)).toBe(100);
        expect(snapToBar(bars, 200)).toBe(160);
        expect(snapToBar(bars, 999)).toBe(220);
    });
    it("첫 봉보다 이르거나 null 이면 null", () => {
        expect(snapToBar(bars, 50)).toBeNull();
        expect(snapToBar(bars, null)).toBeNull();
    });
});

describe("minutesOfDay", () => {
    it("HH:MM[:SS] → 분", () => {
        expect(minutesOfDay("09:44:00")).toBe(584);
        expect(minutesOfDay("08:00")).toBe(480);
    });
});

describe("amountBucketIndex", () => {
    it("20억 미만 -1, 경계는 그 구간에 포함, 200억 이상은 마지막", () => {
        expect(amountBucketIndex(19.9e8)).toBe(-1);
        expect(amountBucketIndex(20e8)).toBe(0);
        expect(amountBucketIndex(69.9e8)).toBe(3);
        expect(amountBucketIndex(70e8)).toBe(4);
        expect(amountBucketIndex(5000e8)).toBe(7);
    });
});

describe("indexAtOrBefore", () => {
    it("참인 앞쪽 구간의 마지막 — 첫 봉부터 거짓이면 0", () => {
        expect(indexAtOrBefore(bars, (b) => b.time <= 170)).toBe(1);
        expect(indexAtOrBefore(bars, (b) => b.time <= 999)).toBe(2);
        expect(indexAtOrBefore(bars, (b) => b.time <= 50)).toBe(0);
    });
});

describe("stepMinute", () => {
    const m = ["08:58:00", "08:59:00", "09:00:00", "15:29:00", "15:30:00", "15:31:00"].map((tradeTime) => ({ tradeTime }));
    it("한 칸·여러 칸 — 시각 이하 마지막 봉에서 출발", () => {
        expect(stepMinute(m, "09:00", 1, "15:30")).toBe("15:29");
        expect(stepMinute(m, "09:00", -1, "15:30")).toBe("08:59");
        expect(stepMinute(m, "08:59", 3, "15:30")).toBe("15:30");
    });
    it("시각 미정 = 장 마감에서 출발", () => {
        expect(stepMinute(m, "", -1, "15:30")).toBe("15:29");
        expect(stepMinute(m, "", 1, "15:30")).toBe("15:31");
    });
    it("양 끝에서 멈춘다 · 첫 봉보다 이른 시각은 첫 봉에서 출발 · 봉이 없으면 null", () => {
        expect(stepMinute(m, "15:31", 20, "15:30")).toBe("15:31");
        expect(stepMinute(m, "08:58", -20, "15:30")).toBe("08:58");
        expect(stepMinute(m, "07:00", 1, "15:30")).toBe("08:59");
        expect(stepMinute([], "09:00", 1, "15:30")).toBeNull();
    });
});
