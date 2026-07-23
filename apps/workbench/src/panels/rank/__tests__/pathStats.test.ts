import { describe, it, expect } from "vitest";
import { computePathStats } from "../pathStats.js";
import type { RankPointPath, RankPathBar } from "../../../api/rankPaths.js";

const bar = (t: number, close: number, high = close, low = close): RankPathBar => ({ t, close, high, low });
const path = (code: string, bars: RankPathBar[]): RankPointPath => ({ stockCode: code, date: "2026-07-01", time: "10:00:00", bars });

describe("computePathStats", () => {
    it("MFE=고가 최댓값·MAE=저가 최솟값·terminal=끝 종가", () => {
        const p = path("X", [bar(0, 0, 0, -1), bar(1, 2, 4, -2), bar(2, 3, 3, 1)]);
        const s = computePathStats([p], Infinity);
        expect(s.excursions).toHaveLength(1);
        expect(s.excursions[0].mfe).toBe(4);
        expect(s.excursions[0].mae).toBe(-2);
        expect(s.excursions[0].terminal).toBe(3);
        expect(s.excursions[0].up).toBe(true);
    });

    it("horizon crop — t 초과 바 제외(MFE·terminal 재계산)", () => {
        const p = path("X", [bar(0, 0), bar(30, 5, 6), bar(90, 10, 12)]);
        const s = computePathStats([p], 30);
        expect(s.excursions[0].mfe).toBe(6); // 90분 바(고가12) 제외
        expect(s.excursions[0].terminal).toBe(5);
        expect(s.maxT).toBe(30);
    });

    it("빈 경로(분봉 없음)는 표본에서 제외", () => {
        const s = computePathStats([path("X", []), path("Y", [bar(0, 0), bar(1, 2)])], Infinity);
        expect(s.excursions.map((e) => e.key.split("|")[0])).toEqual(["Y"]);
    });

    it("우측 절단 — 짧은 경로는 끝난 뒤 리본 표본에서 빠진다", () => {
        // X 는 t=2 까지, Y 는 t=5 까지 → t≤2 는 n=2, t>2 는 n=1.
        const x = path("X", [bar(0, 0), bar(1, 1), bar(2, 2)]);
        const y = path("Y", [bar(0, 0), bar(1, 1), bar(2, 2), bar(3, 3), bar(4, 4), bar(5, 5)]);
        const s = computePathStats([x, y], Infinity);
        expect(s.maxT).toBe(5);
        expect(s.ribbon.n[0]).toBe(2);
        expect(s.ribbon.n[2]).toBe(2);
        expect(s.ribbon.n[3]).toBe(1);
        expect(s.ribbon.n[5]).toBe(1);
    });
});
