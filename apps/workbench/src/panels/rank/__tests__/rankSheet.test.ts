import { describe, it, expect } from "vitest";
import { buildSheetRows, bandFromSelection } from "../rankSheet.js";
import { buildAxisIndex, type AxisIndex } from "../../../lib/rankIndex.js";
import { pointKey } from "../../../lib/pointKey.js";
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

describe("bandFromSelection", () => {
    it("선택된 배치 셀의 약한 끝=lo, 강한 끝=hi.", () => {
        const idx = buildAxisIndex([pp("A", 10), pp("B", 20), pp("C", 30)]);
        const rows = [rpitem("B"), rpitem("C")].map((r) => ({ point: r, cell: idx.get(pointKey(r)) ?? null }));
        // 경계는 그 끝에 선 **타점**으로 나온다(자리는 reindex 가 다시 쓰므로 저장할 수 없다).
        expect(bandFromSelection(rows)).toEqual({ lo: pointKey(rpitem("B")), hi: pointKey(rpitem("C")) });
    });

    it("배치 셀 없으면 null.", () => {
        expect(bandFromSelection([{ point: rpitem("A"), cell: null }])).toBeNull();
    });
});
