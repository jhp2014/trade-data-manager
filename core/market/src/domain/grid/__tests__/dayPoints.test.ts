// 하루 판정 둘 — ① 기준선 돌파 ② 마디 재돌파(decisions 「하루 타점」). 분 목록만 낸다.
import { describe, expect, it } from "vitest";
import type { GridNewHigh, GridPivot, PointGrid } from "../grid.js";
import { baselineBreakMinutes, levelRebreakMinutes, type DayPointKnobs } from "../points.js";

const nh = (min: number, high: number, eok: number, bull = true, maxBefore = 0): GridNewHigh => ({
    min, open: bull ? high - 100 : high, high, low: high - 150, close: bull ? high : high - 100,
    tv: String(eok * 100_000_000), cum: "0", maxBefore,
});
const hi = (min: number, price: number, confirmedMin: number | null, cross: number | null = null): GridPivot => ({
    kind: "high", min, price, confirmedMin, cum: "0", cross: cross === null ? null : { min: cross, tv: "0", cum: "0" },
});
const lo = (min: number, price: number, confirmedMin: number | null = null): GridPivot => ({ kind: "low", min, price, confirmedMin, cum: "0", cross: null });
const grid = (partial: Partial<PointGrid>): PointGrid => ({
    base: null, touch: null, pivots: [], newHighs: [], prevBase: null, prevBaseKrx: null, sessionHigh: { min: 550, price: 10000 }, ...partial,
});
const K = (over: Partial<DayPointKnobs> = {}): DayPointKnobs => ({ gateEok: 50, bullOnly: true, approachPct: 0, onePerLevel: true, ...over });

describe("baselineBreakMinutes — ① 기준선 돌파", () => {
    // 러닝 최고가 갱신 사건: 9950(아래) → 10000(스침) → 10100 → 10200. 기준선 10000.
    const g = grid({ newHighs: [nh(540, 9950, 80), nh(545, 10000, 40, true, 9950), nh(550, 10100, 60, true, 10000), nh(560, 10200, 90, true, 10100)] });

    it("레벨당 하나 — 첫 통과 봉. 스침(≥)도 돌파지만 게이트 미달이면 다음 후보가 선다", () => {
        expect(baselineBreakMinutes(g, 10000, K())).toEqual([550]);
        expect(baselineBreakMinutes(g, 10000, K({ gateEok: 30 }))).toEqual([545]);
    });

    it("끄면 기준선 위 통과 봉 전부 — 기준선 아래 봉은 대금이 커도 아니다", () => {
        expect(baselineBreakMinutes(g, 10000, K({ onePerLevel: false }))).toEqual([550, 560]);
    });

    it("밴드 마진 m' — 기준선 −m' 안의 접근 봉부터 돌파 영역", () => {
        expect(baselineBreakMinutes(g, 10000, K({ approachPct: 0.5 }))).toEqual([540]); // 9950 ≥ 10000×0.995
    });

    it("양봉 요건", () => {
        const bear = grid({ newHighs: [nh(550, 10100, 60, false), nh(560, 10200, 60, true, 10100)] });
        expect(baselineBreakMinutes(bear, 10000, K())).toEqual([560]);
        expect(baselineBreakMinutes(bear, 10000, K({ bullOnly: false }))).toEqual([550]);
    });

    it("피벗을 안 본다 — 격자의 zigzag 와 무관", () => {
        const withPivots = { ...g, pivots: [hi(551, 10100, 555), lo(555, 9800)] };
        expect(baselineBreakMinutes(withPivots, 10000, K())).toEqual(baselineBreakMinutes(g, 10000, K()));
    });
});

describe("levelRebreakMinutes — ② 마디 재돌파(기준선 모름)", () => {
    // 마디 10300(575, 확정 585) → 저 10100 → 재돌파 600(35억)·610(80억).
    const g = grid({
        pivots: [hi(575, 10300, 585), lo(585, 10100)],
        newHighs: [nh(560, 10050, 90), nh(575, 10300, 90, true, 10050), nh(600, 10350, 35, true, 10300), nh(610, 10400, 80, true, 10350)],
        sessionHigh: { min: 610, price: 10400 },
    });

    it("첫 마디 재돌파 — 기준선이 있든 없든 같은 답(기준선을 안 읽는다)", () => {
        expect(levelRebreakMinutes(g, K({ gateEok: 30 }))).toEqual([600]);
        expect(levelRebreakMinutes({ ...g, base: 10000 }, K({ gateEok: 30 }))).toEqual([600]);
    });

    it("게이트 상향 → 같은 마디의 뒤 봉으로 이동, 레벨당 하나를 끄면 통과 봉 전부", () => {
        expect(levelRebreakMinutes(g, K({ gateEok: 50 }))).toEqual([610]);
        expect(levelRebreakMinutes(g, K({ gateEok: 30, onePerLevel: false }))).toEqual([600, 610]);
    });

    it("소수 게이트도 던지지 않는다(BigInt 앞에서 반올림)", () => {
        expect(() => levelRebreakMinutes(g, K({ gateEok: 30.4 }))).not.toThrow();
    });
});
