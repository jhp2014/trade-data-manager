import { describe, expect, it } from "vitest";
import { assemble, computeRowDrop, slotAnchorKey, type RowGeom } from "../rankGeometry.js";
import type { PlacedPoint } from "@trade-data-manager/wire";

const at = (code: string) => ({ stockCode: code, date: "2026-07-01", time: "10:00:00" });
const pp = (orderKey: number, code: string): PlacedPoint => ({ ...at(code), orderKey });

describe("assemble", () => {
    it("같은 자리(orderKey)의 타점을 한 묶음으로, orderKey 오름차 정렬", () => {
        // 자리의 식별자가 orderKey 다 — uq_rank_slot_position 이 축 안 유일성을 보장하므로
        // "같은 orderKey = 같은 자리"이고, 그래서 계약에서 slotId 가 빠졌다.
        const slots = assemble([pp(20, "B1"), pp(10, "A"), pp(20, "B2")]);
        expect(slots.map((s) => s.orderKey)).toEqual([10, 20]);
        expect(slots[1]!.points.map((p) => p.stockCode)).toEqual(["B1", "B2"]);
    });

    it("자리를 가리키는 손잡이는 그 자리에 든 타점 — slot 은 이름이 없다", () => {
        const slots = assemble([pp(10, "A")]);
        expect(slotAnchorKey(slots[0]!)).toBe("A|2026-07-01|10:00:00");
    });
});

/**
 * 행 30px 간격, 위가 강(orderKey 큼) — 시트 정렬 축 열의 모양 그대로.
 * 같은 orderKey 를 주면 타이(한 자리에 여러 행)가 된다.
 */
const rows = (spec: [code: string, orderKey: number][]): RowGeom[] =>
    spec.map(([code, orderKey], i) => ({ point: at(code), orderKey, top: i * 30, bottom: i * 30 + 30, centerY: i * 30 + 15 }));

const ABC = rows([["a", 30], ["b", 20], ["c", 10]]);

describe("computeRowDrop", () => {
    it("행 중심 ±8px 이면 그 자리에 합류(타이)", () => {
        const d = computeRowDrop(ABC, 48, 1, 0); // b 중심 45 에서 3px
        expect(d.tie).toBe(true);
        expect(d.target).toEqual({ kind: "slot", point: at("b") });
    });

    it("dir=1(위가 강)에서 next=위·prev=아래", () => {
        const d = computeRowDrop(ABC, 30, 1, 0); // a(15)~b(45) 사이
        expect(d.tie).toBe(false);
        expect(d.target).toEqual({ kind: "between", after: at("b"), before: at("a") });
    });

    it("dir=-1 이면 prev/next 가 뒤집힌다", () => {
        const d = computeRowDrop(ABC, 30, -1, 0);
        expect(d.target).toEqual({ kind: "between", after: at("a"), before: at("b") });
    });

    // 회귀 — 같은 order_key 사이엔 중간키를 못 만들어 서버가 500 으로 롤백하던 자리(58180f9).
    it("타이 그룹 **내부**에 떨어뜨리면 새 자리가 아니라 그 타이에 합류", () => {
        const tied = rows([["a", 30], ["t1", 20], ["t2", 20], ["c", 10]]);
        const d = computeRowDrop(tied, 60, 1, 0); // t1(45)~t2(75) 사이 — 둘이 같은 자리다
        expect(d.tie).toBe(true);
        expect(d.target).toEqual({ kind: "slot", point: at("t1") });
    });

    it("배치된 행이 없으면 양끝 없는 between + fallback y", () => {
        const d = computeRowDrop([], 50, 1, 123);
        expect(d.target).toEqual({ kind: "between" });
        expect(d.y).toBe(123);
    });

    it("맨 아래 바깥이면 위 이웃만(끝단)", () => {
        const d = computeRowDrop(ABC, 500, 1, 0);
        expect(d.target).toEqual({ kind: "between", before: at("c") });
    });
});
