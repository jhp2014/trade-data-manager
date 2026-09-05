// levelViewOf — 경로 뷰(pivots)에서 마디 뷰(레벨 쌍)를 파생하는 규칙을 못 박는다(§2.5).
// v8 모양(교대 쌍) fixture 는 그대로 재현되고, 국소 극값이 섞이면 레벨만 골라 구간 최솟값 저점을 짝짓는다.
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid } from "../grid.js";
import { levelViewOf } from "../levelView.js";

const piv = (kind: "high" | "low", min: number, price: number, confirmedMin: number | null, cross: number | null = null): GridPivot => ({
    kind,
    min,
    price,
    confirmedMin,
    cum: "0",
    cross: cross === null ? null : { min: cross, tv: "0", cum: "0" },
});

const gridOf = (pivots: GridPivot[], sessionHigh = { min: 0, price: 0 }): PointGrid => ({
    base: null,
    touch: null,
    pivots,
    newHighs: [],
    prevBase: null,
    prevBaseKrx: null,
    sessionHigh,
});

describe("levelViewOf", () => {
    it("v8 모양(교대 쌍) — 레벨 쌍이 그대로 나온다", () => {
        const g = gridOf(
            [
                piv("high", 541, 10000, 542),
                piv("low", 542, 9800, 543),
                piv("high", 545, 10400, 546, 543), // 둘째 레벨 — cross = 직전 레벨 넘은 봉
                piv("low", 546, 10192, null), // 꼬리 저점
            ],
            { min: 545, price: 10400 },
        );
        expect(levelViewOf(g).map((p) => [p.high.min, p.high.price, p.low.min, p.low.price, p.highIndex, p.lowIndex])).toEqual([
            [541, 10000, 542, 9800, 0, 1],
            [545, 10400, 546, 10192, 2, 3],
        ]);
    });

    it("국소 극값이 섞이면 레벨만 골라내고 저점 = 구간 저점 피벗 최솟값(동가 tie 는 이른 봉)", () => {
        const g = gridOf(
            [
                piv("high", 541, 10000, 542), // 레벨 1
                piv("low", 542, 9800, 543),
                piv("high", 544, 9950, 545), // 국소 고점(< 10000) — 레벨 아님
                piv("low", 545, 9750, 547), // 구간 최저
                piv("high", 548, 10300, 550, 547), // 레벨 2 — cross 547
                piv("low", 550, 10100, null),
            ],
            { min: 548, price: 10300 },
        );
        expect(levelViewOf(g).map((p) => [p.high.price, p.low.min, p.low.price])).toEqual([
            [10000, 545, 9750], // 저점 = min(9800, 9750) — 국소 저점이 더 깊다
            [10300, 550, 10100],
        ]);
    });

    it("저점 구간은 다음 레벨의 크로싱에서 끝난다 — 크로싱 이후 저점 피벗은 다음 쌍의 몫", () => {
        const g = gridOf(
            [
                piv("high", 541, 10000, 542),
                piv("low", 542, 9800, 544),
                piv("high", 546, 10500, 548, 544), // 레벨 2 — 크로싱 544
                piv("low", 548, 9700, null), // 크로싱 이후의 더 깊은 저점 — 레벨 1 구간 밖
            ],
            { min: 546, price: 10500 },
        );
        expect(levelViewOf(g).map((p) => [p.high.price, p.low.price])).toEqual([
            [10000, 9800], // 9,700 아님 — 구간이 544 에서 닫힌다
            [10500, 9700],
        ]);
    });

    it("미확정 꼬리 고점은 레벨이 아니다 — 마지막 확정 레벨의 구간이 세션 끝까지 간다", () => {
        const g = gridOf(
            [
                piv("high", 541, 10000, 542),
                piv("low", 542, 9800, 543),
                piv("high", 544, 10500, null), // 꼬리 — 세션 최고가지만 레벨 아님
            ],
            { min: 544, price: 10500 },
        );
        const pairs = levelViewOf(g);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].high.price).toBe(10000);
        expect(pairs[0].low.price).toBe(9800);
    });

    it("확정 저점이 하나도 없는 레벨(결손)은 throw — 침묵 오염 금지(⑥)", () => {
        const g = gridOf([piv("high", 541, 10000, 542)], { min: 541, price: 10000 });
        expect(() => levelViewOf(g)).toThrow(/저점 결손/);
    });

    it("퇴화 예외 — 확정 봉 = 다음 레벨의 크로싱 봉이라 구간이 비면, 바로 다음 저점 피벗이 폴백이다", () => {
        // 선행 국면(클래스 ①): 레벨 10,000@541 이 542 에서 확정됐는데 542 가 곧 10,000 을 넘은 봉
        // (다음 레벨 10,500 의 cross=542) — 열린 구간 (541, 542) 이 빈다. 폴백 = pivots[1](9,790@545).
        const g = gridOf(
            [
                piv("high", 541, 10000, 542),
                piv("low", 545, 9790, 550),
                piv("high", 552, 10500, 553, 542),
                piv("low", 553, 10280, null),
            ],
            { min: 552, price: 10500 },
        );
        expect(levelViewOf(g).map((p) => [p.high.price, p.low.min, p.low.price])).toEqual([
            [10000, 545, 9790], // 구간 밖(≥ cross 542)이지만 폴백으로 짝지어진다
            [10500, 553, 10280],
        ]);
    });

    it("피벗 0(무사건) — 빈 배열", () => {
        expect(levelViewOf(gridOf([]))).toEqual([]);
    });
});
