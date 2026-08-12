import { describe, it, expect } from "vitest";
import { buildAxisOrderIndex, buildAxisOrderIndexes } from "../axisLookup.js";
import type { PlacedPoint } from "@trade-data-manager/wire";

const pl = (stockCode: string, date: string, time: string, slotId: string, orderKey: number): PlacedPoint =>
    ({ stockCode, date, time, slotId, orderKey });

describe("buildAxisOrderIndex", () => {
    it("타점 키로 위치를 찾는다", () => {
        const idx = buildAxisOrderIndex([pl("A", "2025-07-01", "09:21:00", "s1", 10)]);
        expect(idx.byPoint.get("A|2025-07-01|09:21:00")).toBe(10);
    });

    it("배치 안 된 타점은 키가 없다 — 이게 미배치다", () => {
        const idx = buildAxisOrderIndex([pl("A", "2025-07-01", "09:21:00", "s1", 10)]);
        expect(idx.byPoint.get("A|2025-07-01|10:00:00")).toBeUndefined();
    });

    it("차트 키로도 찾는다 — 하루 항목을 판정하려면 필요하다", () => {
        const idx = buildAxisOrderIndex([pl("A", "2025-07-01", "09:21:00", "s1", 10)]);
        expect(idx.byChart.get("A|2025-07-01")).toBe(10);
    });

    it("day 축은 그날 전 타점이 같은 orderKey 라 어느 걸 집든 같다(fanout)", () => {
        const idx = buildAxisOrderIndex([
            pl("A", "2025-07-01", "09:21:00", "s1", 10),
            pl("A", "2025-07-01", "13:05:00", "s1", 10),
        ]);
        expect(idx.byChart.get("A|2025-07-01")).toBe(10);
    });

    it("slotId → orderKey — 밴드 경계가 자리를 되찾는다", () => {
        const idx = buildAxisOrderIndex([
            pl("A", "2025-07-01", "09:21:00", "s1", 10),
            pl("B", "2025-07-02", "09:30:00", "s2", 20),
        ]);
        expect(idx.slots.get("s1")).toBe(10);
        expect(idx.slots.get("s2")).toBe(20);
        expect(idx.slots.get("없는슬롯")).toBeUndefined();
    });

    it("타이(같은 slot 에 여럿)여도 slot 경계는 하나", () => {
        const idx = buildAxisOrderIndex([
            pl("A", "2025-07-01", "09:21:00", "s1", 10),
            pl("B", "2025-07-02", "09:30:00", "s1", 10),
        ]);
        expect(idx.slots.get("s1")).toBe(10);
        expect(idx.byPoint.size).toBe(2);
    });

    it("빈 줄은 빈 색인 — 그 축은 전부 미배치", () => {
        const idx = buildAxisOrderIndex([]);
        expect(idx.byPoint.size).toBe(0);
        expect(idx.byChart.size).toBe(0);
        expect(idx.slots.size).toBe(0);
    });
});

describe("buildAxisOrderIndexes — 축마다 하나씩", () => {
    it("축 키를 그대로 보존한다(빈 축 포함)", () => {
        const lines = new Map<string, PlacedPoint[]>([
            ["a1", [pl("A", "2025-07-01", "09:21:00", "s1", 10)]],
            ["a2", []],
        ]);
        const out = buildAxisOrderIndexes(lines);
        expect([...out.keys()]).toEqual(["a1", "a2"]);
        expect(out.get("a1")!.byPoint.get("A|2025-07-01|09:21:00")).toBe(10);
        expect(out.get("a2")!.byPoint.size).toBe(0);
    });
});
