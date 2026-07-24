import { describe, it, expect } from "vitest";
import { buildAxisIndex, buildSheetRows, bandFromSelection, pkOf, type AxisIndex } from "../rankSheet.js";
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { ReviewPointListItem } from "../../../api/reviewPoints.js";

const pp = (code: string, orderKey: number, slotId: string, time = "10:00:00"): PlacedPoint => ({ stockCode: code, date: "2026-07-01", time, slotId, orderKey });
const rpitem = (code: string, time = "10:00:00", extra: Partial<ReviewPointListItem> = {}): ReviewPointListItem => ({ stockCode: code, date: "2026-07-01", time, name: code + "명", ...extra });

describe("buildAxisIndex", () => {
    it("강=큰 orderKey → rank 1, frac 1. 약=작은 orderKey → rank total, frac 0.", () => {
        const idx = buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2"), pp("C", 30, "s3")]);
        expect(idx.get(pkOf({ stockCode: "C", date: "2026-07-01", time: "10:00:00" }))).toMatchObject({ rank: 1, total: 3, frac: 1 });
        expect(idx.get(pkOf({ stockCode: "B", date: "2026-07-01", time: "10:00:00" }))).toMatchObject({ rank: 2, total: 3, frac: 0.5 });
        expect(idx.get(pkOf({ stockCode: "A", date: "2026-07-01", time: "10:00:00" }))).toMatchObject({ rank: 3, total: 3, frac: 0 });
    });

    it("동점(같은 slot) = 같은 rank, 다음 rank 는 건너뛴다(경쟁순위).", () => {
        // B·C 동점(같은 slot, 같은 orderKey=20). D 가 가장 강(30).
        const idx = buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2"), pp("C", 20, "s2", "10:05:00"), pp("D", 30, "s3")]);
        const at = (code: string, time = "10:00:00"): number => idx.get(pkOf({ stockCode: code, date: "2026-07-01", time }))!.rank;
        expect(at("D")).toBe(1);
        expect(at("B")).toBe(2);
        expect(at("C", "10:05:00")).toBe(2); // 동점
        expect(at("A")).toBe(4); // 2건이 더 강하므로 3이 아니라 4? → 강한 타점 수(D,B,C=3) +1 = 4
    });

    it("빈 라인 → 빈 인덱스.", () => {
        expect(buildAxisIndex([]).size).toBe(0);
    });
});

describe("buildSheetRows", () => {
    it("셀·커버리지(배치된 축 수)·미배치 null.", () => {
        const idxA = buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2")]);
        const idxB = buildAxisIndex([pp("A", 5, "t1")]); // B축엔 A만
        const indexByAxis = new Map<string, AxisIndex>([["axA", idxA], ["axB", idxB]]);
        const rows = buildSheetRows([rpitem("A"), rpitem("B")], ["axA", "axB"], indexByAxis);
        const rowA = rows.find((r) => r.stockCode === "A")!;
        const rowB = rows.find((r) => r.stockCode === "B")!;
        expect(rowA.coverage).toBe(2);
        expect(rowA.cells.axA?.rank).toBe(2);
        expect(rowA.cells.axB?.rank).toBe(1);
        expect(rowB.coverage).toBe(1);
        expect(rowB.cells.axB).toBeNull();
    });
});

describe("bandFromSelection", () => {
    it("선택된 배치 셀의 약한 끝=lo, 강한 끝=hi.", () => {
        const idx = buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2"), pp("C", 30, "s3")]);
        const cells = [idx.get(pkOf(rpitem("B")))!, idx.get(pkOf(rpitem("C")))!];
        expect(bandFromSelection(cells)).toEqual({ lo: "s2", hi: "s3" });
    });

    it("배치 셀 없으면 null.", () => {
        expect(bandFromSelection([null, null])).toBeNull();
    });
});
