import { describe, expect, it } from "vitest";
import { assemble, computeLaneDrop, computeRowDrop, displayU, slotFrac, zoomAt, type RowGeom, type Slot } from "../rankGeometry.js";
import type { PlacedPoint } from "@trade-data-manager/wire";

const pp = (slotId: string, orderKey: number, code: string): PlacedPoint =>
    ({ slotId, orderKey, stockCode: code, date: "2026-07-01", time: "10:00:00" }) as PlacedPoint;

// 트랙 폭 400 → PAD 52 양쪽 제하면 유효 296px. slot 3개면 u=0/0.5/1 → x = 52 / 200 / 348.
const W = 400;
const line3: Slot[] = assemble([pp("a", 10, "A"), pp("b", 20, "B"), pp("c", 30, "C")]);
const FULL = { v0: 0, v1: 1 };

describe("assemble", () => {
    it("같은 slot 의 타점을 한 자리로 묶고 orderKey 오름차 정렬", () => {
        const slots = assemble([pp("b", 20, "B1"), pp("a", 10, "A"), pp("b", 20, "B2")]);
        expect(slots.map((s) => s.slotId)).toEqual(["a", "b"]);
        expect(slots[1].points.map((p) => p.stockCode)).toEqual(["B1", "B2"]);
    });
});

describe("slotFrac / displayU / zoomAt", () => {
    it("slot 하나면 가운데, 여럿이면 균등", () => {
        expect(slotFrac(0, 1)).toBe(0.5);
        expect([0, 1, 2].map((i) => slotFrac(i, 3))).toEqual([0, 0.5, 1]);
    });

    it("줌 창 밖은 0..1 밖으로 나간다(렌더가 그걸 보고 생략)", () => {
        const zoomed = { v0: 0.4, v1: 0.6 };
        expect(displayU(0.5, zoomed)).toBeCloseTo(0.5);
        expect(displayU(0, zoomed)).toBeLessThan(0);
        expect(displayU(1, zoomed)).toBeGreaterThan(1);
    });

    it("커서 지점을 고정점으로 확대하고, 끝에 닿으면 창을 안으로 민다", () => {
        const inMiddle = zoomAt(FULL, 0.5, -1); // 확대
        expect(inMiddle.v1 - inMiddle.v0).toBeCloseTo(0.82);
        expect((inMiddle.v0 + inMiddle.v1) / 2).toBeCloseTo(0.5);

        const atLeftEdge = zoomAt(FULL, 0, -1);
        expect(atLeftEdge.v0).toBe(0); // 왼쪽 밖으로 안 나감
        expect(atLeftEdge.v1).toBeCloseTo(0.82);

        expect(zoomAt(FULL, 0.5, 1)).toEqual(FULL); // 전체에서 더 축소해도 1 을 안 넘음
    });
});

describe("computeLaneDrop", () => {
    it("스팟 가까이(±14px)면 그 자리에 합류(타이)", () => {
        const d = computeLaneDrop(line3, FULL, 200 + 10, W); // 가운데 스팟 b(x=200) 에서 10px
        expect(d.tie).toBe(true);
        expect(d.target).toEqual({ kind: "slot", slotId: "b" });
    });

    it("스팟에서 멀면 좌우 이웃 사이(between)", () => {
        const d = computeLaneDrop(line3, FULL, 260, W); // b(200)~c(348) 중간
        expect(d.tie).toBe(false);
        expect(d.target).toEqual({ kind: "between", prevSlotId: "b", nextSlotId: "c" });
    });

    it("맨 왼쪽 바깥은 prev 없음(끝단) — 서버가 첫 order_key 를 만든다", () => {
        const d = computeLaneDrop(line3, FULL, 0, W);
        expect(d.target).toEqual({ kind: "between", prevSlotId: undefined, nextSlotId: "a" });
    });

    it("빈 축은 양끝 없는 between", () => {
        const d = computeLaneDrop([], FULL, 200, W);
        expect(d.target).toEqual({ kind: "between", prevSlotId: undefined, nextSlotId: undefined });
    });

    it("인디케이터 위치는 트랙 밖으로 과하게 안 튄다(−8..108%)", () => {
        expect(computeLaneDrop(line3, FULL, -9999, W).leftPct).toBe(-8);
        expect(computeLaneDrop(line3, FULL, 9999, W).leftPct).toBe(108);
    });
});

// 행 높이 30, 3행: 중심 y = 15 / 45 / 75.
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
