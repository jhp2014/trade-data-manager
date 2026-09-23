// 하루 타점 재료 어댑터 — 날짜 격자를 zigzag 로 접어 주고(같은 참조 메모), 기준선은 주입 함수 그대로.
import { describe, expect, it } from "vitest";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { cellMaterialsOf } from "../cellMaterials.js";
import type { AutoPointsView } from "../../../lib/usePointGrids.js";
import type { ThemeProjection, ThemeStrengthParams } from "../../../lib/themeStrength.js";

const grid: PointGrid = {
    base: null, touch: null, prevBase: null, prevBaseKrx: null, newHighs: [],
    // 1% 피벗 — 2% 로 접으면 잔 굴곡(고 541·저 542)이 사라진다.
    pivots: [
        { kind: "low", min: 540, price: 100, confirmedMin: 541, cum: "1", cross: null },
        { kind: "high", min: 541, price: 101.5, confirmedMin: 542, cum: "2", cross: null },
        { kind: "low", min: 542, price: 100.4, confirmedMin: 543, cum: "3", cross: null },
        { kind: "high", min: 545, price: 105, confirmedMin: null, cum: "4", cross: null },
    ],
    sessionHigh: { min: 545, price: 105 },
};
const auto = { points: [], byChart: new Map(), rows: [], isLoading: false, error: null } as unknown as AutoPointsView;
const proj = { themesByCode: new Map() } as unknown as ThemeProjection;
const zone = {} as ThemeStrengthParams;

describe("cellMaterialsOf — 하루 타점 재료", () => {
    it("재료를 안 주면 멤버가 없다(엔진이 결손으로 읽는다)", () => {
        const mat = cellMaterialsOf([], "2026-06-17", auto, proj, zone);
        expect(mat.dayGridOf).toBeUndefined();
        expect(mat.baselineOf).toBeUndefined();
    });

    it("zigzag 로 접은 격자를 같은 참조로 돌려주고, 없는 종목·기준선은 null", () => {
        const mat = cellMaterialsOf([], "2026-06-17", auto, proj, zone, {
            grids: new Map([["A", grid]]),
            baselineOf: (c) => (c === "A" ? 104 : null),
        });
        const g2 = mat.dayGridOf!("A", 2)!;
        expect(g2.pivots.length).toBeLessThan(grid.pivots.length);
        expect(mat.dayGridOf!("A", 2)).toBe(g2); // 메모 — 하류 평가 메모의 자
        expect(mat.dayGridOf!("A", 1)).toBe(grid); // 굽기 해상도 이하는 항등
        expect(mat.dayGridOf!("B", 2)).toBeNull();
        expect(mat.baselineOf!("A")).toBe(104);
        expect(mat.baselineOf!("B")).toBeNull();
    });
});
