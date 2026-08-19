import { describe, it, expect } from "vitest";
import { buildSheetRows } from "../rankSheet.js";
import { buildAxisIndex, type AxisIndex } from "../../../lib/rankIndex.js";
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { ReviewPointListItem } from "../../../api/reviewPoints.js";

const pp = (code: string, orderKey: number, time = "10:00:00"): PlacedPoint => ({ stockCode: code, date: "2026-07-01", time, orderKey });
const rpitem = (code: string, time = "10:00:00", extra: Partial<ReviewPointListItem> = {}): ReviewPointListItem => ({ stockCode: code, date: "2026-07-01", time, name: code + "명", ...extra });

describe("buildSheetRows", () => {
    it("축별 셀을 채우고, 그 축에 없는 타점은 null.", () => {
        const idxA = buildAxisIndex([pp("A", 10), pp("B", 20)]);
        const idxB = buildAxisIndex([pp("A", 5)]); // B축엔 A만
        const indexByAxis = new Map<string, AxisIndex>([["axA", idxA], ["axB", idxB]]);
        const rows = buildSheetRows([rpitem("A"), rpitem("B")], ["axA", "axB"], indexByAxis);
        const rowA = rows.find((r) => r.stockCode === "A")!;
        const rowB = rows.find((r) => r.stockCode === "B")!;
        expect(rowA.cells.axA?.rank).toBe(2);
        expect(rowA.cells.axB?.rank).toBe(1);
        expect(rowB.cells.axB).toBeNull();
    });
});
