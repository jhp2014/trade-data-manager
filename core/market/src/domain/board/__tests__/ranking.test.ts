import { describe, it, expect } from "vitest";
import { selectHotUniverse } from "../ranking.js";

const s = (code: string, amount: number, changeRate: number) => ({ code, amount, changeRate });

describe("selectHotUniverse", () => {
    const stocks = [s("A", 100, 1), s("B", 90, 5), s("C", 80, 3), s("D", 10, 9)];

    it("거래대금 상위 ∪ 등락률 상위", () => {
        // amount top2 = A,B / rate top2 = D,B → 합집합
        expect(selectHotUniverse(stocks, 2, 2)).toEqual(new Set(["A", "B", "D"]));
    });

    it("N 이 종목 수 이상이면 전부", () => {
        expect(selectHotUniverse(stocks, 100, 100)).toEqual(new Set(["A", "B", "C", "D"]));
    });

    it("N clamp — 음수·NaN·소수 방어(이상 slice 방지)", () => {
        expect(selectHotUniverse(stocks, -5, Number.NaN)).toEqual(new Set()); // 둘 다 0
        expect(selectHotUniverse(stocks, 1, 0)).toEqual(new Set(["A"])); // amount top1=A, rate top0=∅
        expect(selectHotUniverse(stocks, 2.9, 0)).toEqual(new Set(["A", "B"])); // floor→2
    });
});
