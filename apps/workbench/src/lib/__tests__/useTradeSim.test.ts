// buildSimBasisView / buildSimView — 파생 2층의 조립을 순수 함수로 직접 잰다.
// 곡선 계약(체결 수는 n 에 단조 감소, basis 는 n 무관)이 여기의 회귀선이다.
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid, DerivedPoint } from "@trade-data-manager/market/domain";
import { DEFAULT_TRADE_SIM_PARAMS } from "@trade-data-manager/market/domain";
import { buildSimBasisView, buildSimView } from "../useTradeSim.js";
import type { AutoPointsView, PointGridsView } from "../usePointGrids.js";

const hi = (min: number, price: number): GridPivot => ({ kind: "high", min, price, confirmedMin: min + 1, cum: "0", cross: null });
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: min + 1, cum: "0", cross: null });
const gridOf = (pivots: GridPivot[], sessionHigh: { min: number; price: number }): PointGrid =>
    ({ base: null, touch: null, pivots, newHighs: [], prevBase: null, prevBaseKrx: null, sessionHigh });

// 차트 A: 눌림 3%(9700) 후 상승 — n ≤ 3 체결. 차트 B: 눌림 6%(9400) — n ≤ 6 체결.
const GRID_A = gridOf([hi(510, 10300), lo(520, 9700), hi(540, 10600)], { min: 540, price: 10600 });
const GRID_B = gridOf([hi(510, 10200), lo(530, 9400), hi(550, 10800)], { min: 550, price: 10800 });

const point = (min: number, close: number): DerivedPoint =>
    ({ kind: "breakout", ordinal: 0, min, open: close, high: close, close, tv: "0", levelPrice: close, levelIdx: 0, levelMin: null });

const auto = {
    points: [
        { stockCode: "A", date: "2026-09-01", time: "08:20:00", point: point(500, 10000) },
        { stockCode: "B", date: "2026-09-01", time: "08:20:00", point: point(500, 10000) },
    ],
} as unknown as AutoPointsView;
const grids = {
    gridOf: (code: string) => (code === "A" ? GRID_A : GRID_B),
} as unknown as PointGridsView;

const A_KEY = "A|2026-09-01|08:20:00";
const B_KEY = "B|2026-09-01|08:20:00";
const CANCEL_OFF = { cancelRisePct: null, cancelAfterMin: null };

describe("buildSimBasisView — 취소 노브만 의존(n 무관)", () => {
    it("요구 타점 % 가 차트별 최저 눌림에서 나온다", () => {
        const b = buildSimBasisView(auto, grids, CANCEL_OFF);
        expect(b.total).toBe(2);
        expect(b.byKey.get(A_KEY)!.requiredPct).toBeCloseTo(3, 10);
        expect(b.byKey.get(B_KEY)!.requiredPct).toBeCloseTo(6, 10);
    });
});

describe("buildSimView — 체결 수는 n 에 단조 감소, basis 등가", () => {
    const filledCount = (pct: number): number => {
        const v = buildSimView(auto, grids, { ...DEFAULT_TRADE_SIM_PARAMS, entry: { anchor: "close", pct } });
        let c = 0;
        for (const r of v.byKey.values()) if (r.status === "stop" || r.status === "take" || r.status === "open") c++;
        return c;
    };

    it("n=0(즉시) 전부 체결 → n=3 둘 → n=5 하나 → n=7 없음 — 단조 감소·basis 와 전수 일치", () => {
        expect(filledCount(0)).toBe(2);
        expect(filledCount(3)).toBe(2);
        expect(filledCount(5)).toBe(1);
        expect(filledCount(7)).toBe(0);
        const b = buildSimBasisView(auto, grids, CANCEL_OFF);
        for (const pct of [2, 3, 3.5, 5, 6, 7]) {
            const expected = [...b.byKey.values()].filter((x) => x.requiredPct !== null && x.requiredPct >= pct).length;
            expect(filledCount(pct)).toBe(expected);
        }
    });

    it("params 원본이 view 에 실린다(패널 표기·시트 셀 공용)", () => {
        const v = buildSimView(auto, grids, DEFAULT_TRADE_SIM_PARAMS);
        expect(v.params).toBe(DEFAULT_TRADE_SIM_PARAMS);
        expect(v.byKey.size).toBe(2);
    });
});
