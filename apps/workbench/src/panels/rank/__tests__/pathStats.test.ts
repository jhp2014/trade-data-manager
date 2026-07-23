import { describe, it, expect } from "vitest";
import { computePathStats, simulateTargetStop } from "../pathStats.js";
import type { RankPointPath, RankPathBar } from "../../../api/rankPaths.js";

const bar = (t: number, close: number, high = close, low = close): RankPathBar => ({ t, close, high, low });
const path = (code: string, bars: RankPathBar[]): RankPointPath => ({ stockCode: code, date: "2026-07-01", time: "10:00:00", bars });

describe("computePathStats", () => {
    it("MFE·tPeak·분할 MAE(고점 전/후)·terminal", () => {
        // 저가: 0→-1, 30→-2, 60(고점)→1, 90→-4. 고점 t=60(고가6).
        const p = path("X", [bar(0, 0, 0, -1), bar(30, 3, 4, -2), bar(60, 5, 6, 1), bar(90, 2, 3, -4)]);
        const s = computePathStats([p], Infinity);
        const e = s.excursions[0];
        expect(e.mfe).toBe(6);
        expect(e.tPeak).toBe(60);
        expect(e.maePre).toBe(-2); // [0,60] 최저
        expect(e.maePost).toBe(-4); // [60,90] 최저
        expect(e.terminal).toBe(2);
    });

    it("horizon crop — 고점 이후 바 제외 시 tPeak·maePost 재계산", () => {
        const p = path("X", [bar(0, 0, 0, -1), bar(30, 3, 4, -1), bar(90, 8, 10, -5)]);
        const s = computePathStats([p], 30);
        expect(s.excursions[0].mfe).toBe(4);
        expect(s.excursions[0].tPeak).toBe(30);
        expect(s.excursions[0].maePost).toBe(-1); // 90분 바 제외 → 고점(30) 이후 저가 = 자기 자신 -1
        expect(s.maxT).toBe(30);
    });

    it("진입 전(음수 t) 바는 MFE/MAE 계산에서 제외(맥락 궤적)", () => {
        // t=-5 에 고가 99·저가 -99(극단) 있어도 t≥0 만 봐야 → mfe=4, maePre/maePost=-1.
        const p = path("X", [bar(-5, 0, 99, -99), bar(0, 0, 0, -1), bar(30, 3, 4, -1)]);
        const s = computePathStats([p], Infinity);
        expect(s.excursions[0].mfe).toBe(4);
        expect(s.excursions[0].maePre).toBe(-1);
        expect(s.excursions[0].maePost).toBe(-1);
    });

    it("빈 경로는 표본 제외", () => {
        const s = computePathStats([path("X", []), path("Y", [bar(0, 0), bar(1, 2, 3, -1)])], Infinity);
        expect(s.excursions.map((e) => e.key.split("|")[0])).toEqual(["Y"]);
    });
});

describe("simulateTargetStop", () => {
    const up = path("U", [bar(0, 0, 1, -1), bar(1, 2, 3, 0), bar(2, 5, 6, 2)]); // 고가 6 → +6 목표 도달, 저가 최저 -1
    const down = path("D", [bar(0, 0, 1, -2), bar(1, -3, -1, -4)]); // 저가 -4 → -3 손절 먼저
    const none = path("N", [bar(0, 0, 1, -1), bar(1, 1, 2, 0)]); // 목표·손절 둘 다 미도달

    it("고가/저가 첫터치로 승/패/미도달 분류", () => {
        const r = simulateTargetStop([up, down, none], Infinity, 6, -3);
        expect(r.win).toBe(1);
        expect(r.loss).toBe(1);
        expect(r.none).toBe(1);
        expect(r.total).toBe(3);
    });

    it("같은 바에서 목표·손절 동시 = 손절(보수)", () => {
        const both = path("B", [bar(0, 0, 6, -3)]); // 고가6(+6 도달)·저가-3(-3 도달) 동시
        const r = simulateTargetStop([both], Infinity, 6, -3);
        expect(r.loss).toBe(1);
        expect(r.win).toBe(0);
    });

    it("기대값 R = winRate·(target/|stop|) − lossRate", () => {
        // 목표 +6 / 손절 -3 → R=2. 승1·패1·미도달1 중 → 1/3*2 - 1/3 = 0.333...
        const r = simulateTargetStop([up, down, none], Infinity, 6, -3);
        expect(r.expR).toBeCloseTo(1 / 3, 5);
    });
});
