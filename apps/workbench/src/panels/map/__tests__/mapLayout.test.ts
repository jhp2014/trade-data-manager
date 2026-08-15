import { describe, it, expect } from "vitest";
import { absCenterOf, BOX_HEADER, BOX_PAD, dropTargetAt, LEAF_H, LEAF_W, layoutMap, type LayoutItem } from "../mapLayout.js";

const item = (id: string, x: number, y: number, parentId: string | null = null): LayoutItem => ({ id, parentId, x, y });

describe("layoutMap — 잎", () => {
    it("저장 중심을 왼쪽위로 바꿔 고정 크기로 놓는다", () => {
        const [n] = layoutMap([item("a", 100, 50)]);
        expect(n).toMatchObject({
            id: "a", container: false, depth: 0,
            position: { x: 100 - LEAF_W / 2, y: 50 - LEAF_H / 2 },
            width: LEAF_W, height: LEAF_H,
        });
        expect(n!.parentId).toBeUndefined();
    });
});

describe("layoutMap — 컨테이너", () => {
    // 부모 p, 자식 a(0,0)·b(300,100)
    const items = [item("p", 999, 999), item("a", 0, 0, "p"), item("b", 300, 100, "p")];

    it("부모가 배열에서 먼저 온다(RF 요구)", () => {
        expect(layoutMap(items).map((n) => n.id)).toEqual(["p", "a", "b"]);
    });

    it("컨테이너 자리는 자식 바운딩 박스 + 여백 — 저장 좌표(999,999)는 무시", () => {
        const p = layoutMap(items).find((n) => n.id === "p")!;
        expect(p.container).toBe(true);
        expect(p.abs.x).toBe(0 - LEAF_W / 2 - BOX_PAD);
        expect(p.abs.y).toBe(0 - LEAF_H / 2 - BOX_PAD - BOX_HEADER);
        expect(p.abs.w).toBe(300 + LEAF_W + BOX_PAD * 2);
        expect(p.abs.h).toBe(100 + LEAF_H + BOX_PAD * 2 + BOX_HEADER);
    });

    it("자식 position 은 부모 왼쪽위 기준 상대", () => {
        const laid = layoutMap(items);
        const p = laid.find((n) => n.id === "p")!;
        const a = laid.find((n) => n.id === "a")!;
        expect(a.parentId).toBe("p");
        expect(a.position).toEqual({ x: a.abs.x - p.abs.x, y: a.abs.y - p.abs.y });
        // 자식은 컨테이너 안에 있다(왼쪽위 여백 = PAD, 위는 PAD+HEADER).
        expect(a.position.x).toBe(BOX_PAD);
        expect(a.position.y).toBe(BOX_PAD + BOX_HEADER);
    });

    it("중첩 2단 — 손자까지 층이 쌓이고 컨테이너가 컨테이너를 담는다", () => {
        const laid = layoutMap([item("g", 0, 0), item("p", 0, 0, "g"), item("c", 50, 50, "p")]);
        expect(laid.map((n) => n.id)).toEqual(["g", "p", "c"]);
        expect(laid.map((n) => n.depth)).toEqual([0, 1, 2]);
        const g = laid.find((n) => n.id === "g")!;
        const p = laid.find((n) => n.id === "p")!;
        expect(g.abs.w).toBe(p.abs.w + BOX_PAD * 2);
    });

    it("끊긴 부모는 루트 취급 — 지어내지 않는다", () => {
        const [n] = layoutMap([item("a", 0, 0, "사라짐")]);
        expect(n!.parentId).toBeUndefined();
        expect(n!.depth).toBe(0);
    });

    it("순환은 잎으로 끊고 전부 그린다 — 화면이 멈추는 것보다 낫다", () => {
        const laid = layoutMap([item("a", 0, 0, "b"), item("b", 100, 0, "a")]);
        expect(laid).toHaveLength(2);
        expect(laid.every((n) => Number.isFinite(n.abs.x))).toBe(true);
    });
});

describe("dropTargetAt — 가장 깊은 담는 그룹", () => {
    const laid = layoutMap([
        item("g", 0, 0), item("p", 0, 0, "g"), item("c", 0, 0, "p"), // g ⊃ p ⊃ c
        item("solo", 500, 500),
    ]);

    it("겹치면 깊은 쪽이 이긴다", () => {
        // c 의 중심(0,0)은 g·p·c 전부 안이지만 c 자신 제외 → p.
        expect(dropTargetAt(laid, { x: 0, y: 0 }, "solo")).toBe("c");
        expect(dropTargetAt(laid, { x: 0, y: 0 }, "c")).toBe("p");
    });

    it("제 자손에는 못 넣는다(순환 방지) — 자손을 빼면 그 위 조상이 잡힌다", () => {
        expect(dropTargetAt(laid, { x: 0, y: 0 }, "p")).toBe("g");
        expect(dropTargetAt(laid, { x: 0, y: 0 }, "g")).toBeNull();
    });

    it("빈 곳이면 null(최상위로)", () => {
        expect(dropTargetAt(laid, { x: 9999, y: 9999 }, "solo")).toBeNull();
    });

    it("잎 위에 떨어뜨리면 그 잎이 부모가 된다 — 첫 중첩을 만드는 손짓", () => {
        expect(dropTargetAt(laid, { x: 500, y: 500 }, "c")).toBe("solo");
    });
});

describe("absCenterOf — 드래그 커밋의 역변환", () => {
    it("루트 잎: 왼쪽위 + 반크기 = 중심", () => {
        const laid = layoutMap([item("a", 100, 50)]);
        expect(absCenterOf(laid, "a", { x: 0, y: 0 })).toEqual({ x: LEAF_W / 2, y: LEAF_H / 2 });
    });

    it("자식: 부모 절대 왼쪽위를 더해 되돌린다 — 저장 좌표(중심·절대)와 일치", () => {
        const laid = layoutMap([item("p", 0, 0), item("a", 30, 40, "p"), item("b", 200, 90, "p")]);
        const a = laid.find((n) => n.id === "a")!;
        expect(absCenterOf(laid, "a", a.position)).toEqual({ x: 30, y: 40 });
    });

    it("모르는 id 는 null", () => {
        expect(absCenterOf([], "없음", { x: 0, y: 0 })).toBeNull();
    });
});
