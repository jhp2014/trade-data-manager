// 비사건 좌표의 걷기 — 라벨=타점(2026-09-18 「구조 개편」 B)의 core 전제: walkOutcome/simFillBasis 는
// 시그널이 격자 **사건 봉일 필요가 없다**(피벗 경로는 하루 전체를 담는다 — {min, high}/{min, close}만 본다).
// sliceOutcome 의 분모는 좌표 봉 **종가**(봉 사실 close)라는 계약도 여기서 못 박는다.
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid } from "../grid.js";
import { simFillBasis } from "../simulate.js";
import { sliceOutcome, walkOutcome } from "../outcome.js";

const hi = (min: number, price: number, cross: GridPivot["cross"] = null): GridPivot =>
    ({ kind: "high", min, price, confirmedMin: min + 3, cum: "0", cross });
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: min + 3, cum: "0", cross: null });

// 경로: 고 575(110) → 저 580(104) → 고 590(120, 크로싱 588) → 저 595(110). 세션 최고가 = 590봉 120.
const GRID: PointGrid = {
    base: null, // 기준선 없는 라벨 차트(A1 의 base null 굽기)에서도 걷기가 서는지까지 겸해 잰다
    touch: null,
    pivots: [hi(575, 110), lo(580, 104), hi(590, 120, { min: 588, tv: "0", cum: "0" }), lo(595, 110)],
    newHighs: [],
    prevBase: null,
    prevBaseKrx: null,
    sessionHigh: { min: 590, price: 120 },
};

describe("walkOutcome — 비사건 좌표", () => {
    it("사건 봉 사이의 임의 분 — 이후 레벨 쌍이 breakpoint 로 선다", () => {
        const walk = walkOutcome(GRID, { min: 585, high: 118 });
        expect(walk.breaks).toHaveLength(1);
        expect(walk.breaks[0]).toMatchObject({ highMin: 590, highPrice: 120, lowMin: 595, lowPrice: 110 });
        expect(walk.sessionHigh).toEqual({ min: 590, price: 120 }); // 세션 최고가가 p 뒤 — 그대로
    });

    it("모든 사건 뒤의 임의 분 — 무눌림, 연장 상한은 자기 봉 고가 폴백(과거 고가 금지)", () => {
        const walk = walkOutcome(GRID, { min: 900, high: 121 });
        expect(walk.breaks).toHaveLength(0);
        expect(walk.sessionHigh).toEqual({ min: 900, price: 121 });
        const s = sliceOutcome(walk, 2, 120);
        expect(s.status).toBe("none");
        expect(s.extHighPrice).toBe(121);
        expect(s.extPct).toBeCloseTo(((121 - 120) / 120) * 100, 10);
        expect(s.lowMin).toBeNull();
    });

    it("sliceOutcome 분모 = 좌표 봉 종가 — 같은 걷기라도 close 가 다르면 % 가 그만큼 다르다", () => {
        const walk = walkOutcome(GRID, { min: 585, high: 118 });
        const a = sliceOutcome(walk, 2, 115);
        const b = sliceOutcome(walk, 2, 100);
        expect(a.status).toBe("exceeded"); // 깊이 8.33% ≥ T2
        expect(a.extHighPrice).toBe(120);
        expect(a.extPct).toBeCloseTo(((120 - 115) / 115) * 100, 10);
        expect(b.extPct).toBeCloseTo(((120 - 100) / 100) * 100, 10);
    });
});

describe("simFillBasis — 비사건 좌표", () => {
    it("요구 타점 % 가 좌표 종가 분모·이후 저점에서 나온다", () => {
        const b = simFillBasis(GRID, { min: 585, close: 115 }, { cancelRisePct: null, cancelAfterMin: null });
        expect(b.requiredPct).toBeCloseTo(((115 - 110) / 115) * 100, 10); // 이후 최저 눌림 = 595봉 110
    });
});
