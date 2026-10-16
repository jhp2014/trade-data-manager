// 파생층 — 분당 원값 → % 공간(UN 한 벌). 반올림(소수 2자리)·누적 고저·누적 대금·base 폴백을 본다.
import { describe, expect, it } from "vitest";
import type { DayFlowStock } from "./types.js";
import { deriveFlowStock } from "./flowDerive.js";

const stock = (over: Partial<DayFlowStock>): DayFlowStock => ({
    code: "000001",
    times: [100, 160, 220],
    close: [205, 212, 207],
    high: [206, 214, 208],
    low: [199, 195, 205],
    amount: [10, 0, 20],
    open: 203,
    basePrice: { krx: 198, un: 200 },
    marketCap: "123",
    ...over,
});

describe("deriveFlowStock", () => {
    it("UN 기준가 대비 %(소수 2자리) · 누적 고저 · 누적 대금 — basePrice·marketCap 은 그대로 승계", () => {
        const d = deriveFlowStock(stock({}));
        expect(d.rate).toEqual([2.5, 6, 3.5]); // (205|212|207 − 200)/200×100
        expect(d.high).toEqual([3, 7, 7]); // 러닝 최고가 206→214→214
        expect(d.low).toEqual([-0.5, -2.5, -2.5]); // 러닝 최저가 199→195→195(갱신 경로 — 덮어쓰기 회귀를 잡는다)
        expect(d.open).toBe(1.5);
        expect(d.cumAmount).toEqual([10, 10, 30]); // 무거래 분(amount 0)은 평탄
        expect(d.basePrice).toEqual({ krx: 198, un: 200 });
        expect(d.marketCap).toBe("123");
        expect(d.times).toEqual([100, 160, 220]);
    });

    it("반올림은 값마다 소수 2자리(core r2 와 같은 자리)", () => {
        const d = deriveFlowStock(stock({ close: [201, 201, 201], basePrice: { krx: null, un: 300 } }));
        expect(d.rate[0]).toBe(-33); // (201−300)/300×100 = −33
        const e = deriveFlowStock(stock({ close: [207, 207, 207], basePrice: { krx: null, un: 999 } }));
        expect(e.rate[0]).toBe(-79.28); // −79.2793… → 2자리
    });

    it("기준가 없음(un null) = 당일 시가 폴백, 시가도 0 이면 전부 0% — 옛 서버 규칙 그대로", () => {
        const fallback = deriveFlowStock(stock({ basePrice: { krx: null, un: null } }));
        expect(fallback.open).toBe(0); // base = open(203)
        expect(fallback.rate[0]).toBe(0.99); // (205−203)/203×100 = 0.985… → 0.99
        const zero = deriveFlowStock(stock({ basePrice: { krx: null, un: null }, open: 0 }));
        expect(zero.rate).toEqual([0, 0, 0]);
    });
});
