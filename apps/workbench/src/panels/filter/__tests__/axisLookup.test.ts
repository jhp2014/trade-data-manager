import { describe, it, expect } from "vitest";
import { buildAxisOrderIndex, buildAxisOrderIndexes } from "../axisLookup.js";
import type { PlacedPoint } from "@trade-data-manager/wire";

const pl = (stockCode: string, date: string, time: string, orderKey: number): PlacedPoint =>
    ({ stockCode, date, time, orderKey });
/** day 축 줄 항목 — 행 = 차트(시각 없음). */
const chartRow = (stockCode: string, date: string, orderKey: number): PlacedPoint => ({ stockCode, date, orderKey });

describe("buildAxisOrderIndex — 행 키 색인(point 축 = 타점 키 · day 축 = 차트 키)", () => {
    it("point 축 줄은 타점 키로 위치를 찾는다", () => {
        const idx = buildAxisOrderIndex([pl("A", "2025-07-01", "09:21:00", 10)]);
        expect(idx.get("A|2025-07-01|09:21:00")).toBe(10);
    });

    it("값 없는 타점은 키가 없다 — 이게 미배치다", () => {
        const idx = buildAxisOrderIndex([pl("A", "2025-07-01", "09:21:00", 10)]);
        expect(idx.get("A|2025-07-01|10:00:00")).toBeUndefined();
    });

    it("point 축 줄에 차트 키는 **없다** — 폴백 조회가 point 축에서 잘못 맞을 수 없다", () => {
        const idx = buildAxisOrderIndex([pl("A", "2025-07-01", "09:21:00", 10)]);
        expect(idx.get("A|2025-07-01")).toBeUndefined();
    });

    it("day 축 줄(시각 없는 행)은 차트 키로 선다 — 하루 항목·타점 폴백이 둘 다 이 키에 닿는다", () => {
        const idx = buildAxisOrderIndex([chartRow("A", "2025-07-01", 10)]);
        expect(idx.get("A|2025-07-01")).toBe(10);
        expect(idx.get("A|2025-07-01|09:21:00")).toBeUndefined();
    });

    it("타이(같은 자리에 여럿)여도 행 키는 각각", () => {
        const idx = buildAxisOrderIndex([
            pl("A", "2025-07-01", "09:21:00", 10),
            pl("B", "2025-07-02", "09:30:00", 10),
        ]);
        expect(idx.size).toBe(2);
    });

    it("빈 줄은 빈 색인 — 그 축은 전부 미배치", () => {
        expect(buildAxisOrderIndex([]).size).toBe(0);
    });
});

describe("buildAxisOrderIndexes — 축마다 하나씩", () => {
    it("축 키를 그대로 보존한다(빈 축 포함)", () => {
        const lines = new Map<string, PlacedPoint[]>([
            ["a1", [pl("A", "2025-07-01", "09:21:00", 10)]],
            ["a2", []],
        ]);
        const out = buildAxisOrderIndexes(lines);
        expect([...out.keys()]).toEqual(["a1", "a2"]);
        expect(out.get("a1")!.get("A|2025-07-01|09:21:00")).toBe(10);
        expect(out.get("a2")!.size).toBe(0);
    });
});
