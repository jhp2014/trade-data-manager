import { describe, expect, it } from "vitest";
import { dailyNorm, minuteNorm, minutesOf, toBasePct } from "../normModel.js";
import type { ChartBundle } from "../../../api/chart.js";

const bar = (o: number, h: number, l: number, c: number) =>
    ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: "0", amount: "0" });

const daily = (date: string, krx: ReturnType<typeof bar>, un = krx) => ({ stockCode: "0001", date, krx, un });

const minute = (time: string, un: ReturnType<typeof bar>) =>
    ({ stockCode: "0001", date: "2026-08-21", time, krx: null, un });

const bundle = (over: Partial<ChartBundle>): ChartBundle =>
    ({ stockCode: "0001", daily: [], minutes: [], basePrice: null, ...over });

describe("dailyNorm — 원점 = D−1 종가", () => {
    const b = bundle({
        daily: [
            daily("2026-08-19", bar(90, 95, 88, 92)),
            daily("2026-08-20", bar(95, 110, 94, 100)), // D−1 종가 100 = 원점
            daily("2026-08-21", bar(105, 130, 102, 120)),
        ],
    });

    it("마지막 봉이 t=0, 과거가 음수 — 값은 원점 대비 %", () => {
        const n = dailyNorm(b, "krx");
        expect(n).not.toBeNull();
        expect(n!.origin).toBe(100);
        expect(n!.originFallback).toBe(false);
        expect(n!.bars.map((x) => x.t)).toEqual([-2, -1, 0]);
        expect(n!.bars[2].close).toBeCloseTo(20);
        expect(n!.bars[2].high).toBeCloseTo(30);
        expect(n!.bars[0].close).toBeCloseTo(-8);
    });

    it("시장 토글 — 봉과 원점이 함께 갈린다", () => {
        const dual = bundle({
            daily: [
                daily("2026-08-20", bar(95, 110, 94, 100), bar(96, 111, 95, 102)),
                daily("2026-08-21", bar(105, 130, 102, 120), bar(106, 131, 103, 121)),
            ],
        });
        expect(dailyNorm(dual, "krx")!.origin).toBe(100);
        expect(dailyNorm(dual, "un")!.origin).toBe(102);
    });

    it("D−1 결측 = 당일 첫 시가 폴백(basePrice 규칙과 동일) + 표시", () => {
        const single = bundle({ daily: [daily("2026-08-21", bar(200, 230, 195, 220))] });
        const n = dailyNorm(single, "krx");
        expect(n!.origin).toBe(200);
        expect(n!.originFallback).toBe(true);
        expect(n!.bars[0].close).toBeCloseTo(10);
    });

    it("봉 0개·원점 0 이하 = 결손(null)", () => {
        expect(dailyNorm(bundle({}), "krx")).toBeNull();
        expect(dailyNorm(bundle({ daily: [daily("2026-08-21", bar(0, 0, 0, 0))] }), "krx")).toBeNull();
    });
});

describe("minuteNorm — 원점 = 타점 시각 UN 종가, 하루 전체(절단 없음)", () => {
    const b = bundle({
        minutes: [
            minute("09:00:00", bar(100, 102, 99, 101)),
            minute("10:30:00", bar(101, 105, 100, 104)), // 타점 — 원점 104
            minute("14:00:00", bar(104, 108, 96, 98)),
        ],
    });

    it("t = 벽시계 분, 타점 이후도 그대로 남는다", () => {
        const n = minuteNorm(b, "10:30:00");
        expect(n).not.toBeNull();
        expect(n!.origin).toBe(104);
        expect(n!.bars.map((x) => x.t)).toEqual([540, 630, 840]);
        expect(n!.bars[1].close).toBeCloseTo(0);
        expect(n!.bars[2].low).toBeCloseTo(((96 / 104) - 1) * 100);
    });

    it("타점 시각 분봉 미수집 = 결손(null)", () => {
        expect(minuteNorm(b, "11:11:00")).toBeNull();
        expect(minuteNorm(bundle({}), "10:30:00")).toBeNull();
    });
});

describe("toBasePct — 정규화 % → 전일 종가 기준 %(커서 읽기값)", () => {
    it("원점 104·기준가 100: 0% → +4%, -4% → -0.16%", () => {
        expect(toBasePct(0, 104, 100)).toBeCloseTo(4);
        expect(toBasePct(-4, 104, 100)).toBeCloseTo(104 * 0.96 - 100);
    });
    it("기준가 없음·0 이하 = null", () => {
        expect(toBasePct(0, 104, null)).toBeNull();
        expect(toBasePct(0, 104, 0)).toBeNull();
    });
});

describe("minutesOf", () => {
    it("HH:MM:SS → 분", () => {
        expect(minutesOf("09:00:00")).toBe(540);
        expect(minutesOf("15:30:00")).toBe(930);
    });
});
