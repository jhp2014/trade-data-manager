import { describe, expect, it } from "vitest";
import { assemble, computeRowDrop, type RowGeom } from "../rankGeometry.js";
import type { PlacedPoint } from "@trade-data-manager/wire";

const pp = (slotId: string, orderKey: number, code: string): PlacedPoint =>
    ({ slotId, orderKey, stockCode: code, date: "2026-07-01", time: "10:00:00" }) as PlacedPoint;

describe("assemble", () => {
    it("같은 slot 의 타점을 한 자리로 묶고 orderKey 오름차 정렬", () => {
        const slots = assemble([pp("b", 20, "B1"), pp("a", 10, "A"), pp("b", 20, "B2")]);
        expect(slots.map((s) => s.slotId)).toEqual(["a", "b"]);
        expect(slots[1].points.map((p) => p.stockCode)).toEqual(["B1", "B2"]);
    });
});

/** 행 30px 간격, 위가 강(orderKey 큼) — 시트 정렬 축 열의 모양 그대로. */
const rows = (slotIds: string[]): RowGeom[] =>
    slotIds.map((slotId, i) => ({ slotId, orderKey: (slotIds.length - i) * 10, top: i * 30, bottom: i * 30 + 30, centerY: i * 30 + 15 }));

describe("computeRowDrop", () => {
    it("행 중심 ±8px 이면 그 자리에 합류(타이)", () => {
        const d = computeRowDrop(rows(["a", "b", "c"]), 48, 1, 0); // b 중심 45 에서 3px
        expect(d.tie).toBe(true);
        expect(d.target).toEqual({ kind: "slot", slotId: "b" });
    });

    it("dir=1(위가 강)에서 next=위·prev=아래", () => {
        const d = computeRowDrop(rows(["a", "b", "c"]), 30, 1, 0); // a(15)~b(45) 사이
        expect(d.tie).toBe(false);
        expect(d.target).toEqual({ kind: "between", prevSlotId: "b", nextSlotId: "a" });
    });

    it("dir=-1 이면 prev/next 가 뒤집힌다", () => {
        const d = computeRowDrop(rows(["a", "b", "c"]), 30, -1, 0);
        expect(d.target).toEqual({ kind: "between", prevSlotId: "a", nextSlotId: "b" });
    });

    // 회귀 — 같은 order_key 사이엔 중간키를 못 만들어 서버가 500 으로 롤백하던 자리(58180f9).
    it("타이 그룹 **내부**에 떨어뜨리면 새 자리가 아니라 그 타이에 합류", () => {
        const d = computeRowDrop(rows(["a", "t", "t", "c"]), 60, 1, 0); // t(45)~t(75) 사이
        expect(d.tie).toBe(true);
        expect(d.target).toEqual({ kind: "slot", slotId: "t" });
    });

    it("배치된 행이 없으면 양끝 없는 between + fallback y", () => {
        const d = computeRowDrop([], 50, 1, 123);
        expect(d.target).toEqual({ kind: "between", prevSlotId: undefined, nextSlotId: undefined });
        expect(d.y).toBe(123);
    });

    it("맨 아래 바깥이면 위 이웃만(끝단)", () => {
        const d = computeRowDrop(rows(["a", "b", "c"]), 500, 1, 0);
        expect(d.target).toEqual({ kind: "between", prevSlotId: undefined, nextSlotId: "c" });
    });
});
