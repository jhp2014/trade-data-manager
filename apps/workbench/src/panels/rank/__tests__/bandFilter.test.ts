import { describe, it, expect } from "vitest";
import { filterPoints, type AxisBand } from "../bandFilter.js";
import type { PlacedPoint } from "@trade-data-manager/wire";

// PlacedPoint 헬퍼 — orderKey 로 슬롯 순서, code 로 타점 구분(같은 date/time 로 단순화).
const pp = (code: string, orderKey: number, slotId = `s${orderKey}`): PlacedPoint => ({
    slotId,
    orderKey,
    stockCode: code,
    date: "2026-07-01",
    time: "10:00:00",
});
const codesOf = (r: { points: { stockCode: string }[] }): string[] => r.points.map((p) => p.stockCode).sort();

describe("filterPoints — 밴드 AND", () => {
    // A축: X(1)·Y(2)·Z(3)   B축: X(1)·Y(2)   (Z 는 B 미배치)
    const lines = new Map<string, PlacedPoint[]>([
        ["A", [pp("X", 1), pp("Y", 2), pp("Z", 3)]],
        ["B", [pp("X", 1), pp("Y", 2)]],
    ]);

    it("밴드 없으면 빈 결과", () => {
        expect(filterPoints(lines, [])).toEqual({ points: [], coverage: 0 });
    });

    it("단일 축 밴드 = orderKey 구간(양끝 포함)", () => {
        const bands: AxisBand[] = [{ axisId: "A", from: 1, to: 2 }];
        expect(codesOf(filterPoints(lines, bands))).toEqual(["X", "Y"]);
    });

    it("strict AND — 활성 축 전부에 배치돼야 매치, 미배치는 탈락", () => {
        // A 밴드는 Z(3) 포함하지만 Z 는 B 미배치 → 탈락. coverage 도 A∩B 배치분(X,Y)만.
        const bands: AxisBand[] = [{ axisId: "A", from: 1, to: 3 }, { axisId: "B", from: 1, to: 2 }];
        const r = filterPoints(lines, bands);
        expect(codesOf(r)).toEqual(["X", "Y"]);
        expect(r.coverage).toBe(2);
    });

    it("coverage = 활성 축 전부에 배치된 모수(밴드 무시), N ≤ coverage", () => {
        // B 밴드를 슬롯1 로 좁히면 X 만 통과하지만 coverage 는 여전히 2(X,Y 둘 다 A∩B 배치).
        const bands: AxisBand[] = [{ axisId: "A", from: 1, to: 3 }, { axisId: "B", from: 1, to: 1 }];
        const r = filterPoints(lines, bands);
        expect(codesOf(r)).toEqual(["X"]);
        expect(r.coverage).toBe(2);
    });
});
