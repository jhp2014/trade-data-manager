import { describe, it, expect } from "vitest";
import {
    absCenterOf, BOX_HEADER, BOX_PAD, DOT_MAX, DOT_MIN, dropTargetAt, LABEL_H, LABEL_W,
    layoutMap, leafSize, type LayoutItem,
} from "../mapLayout.js";

/** 기본 잎 — 크기는 호출부가 주는 값이라 테스트는 고정치를 쓴다(레이아웃은 크기의 출처를 모른다). */
const LEAF_W = 120, LEAF_H = 50;
const item = (id: string, x: number, y: number, parentId: string | null = null, w = LEAF_W, h = LEAF_H): LayoutItem =>
    ({ id, parentId, x, y, w, h });

describe("leafSize — 수를 지름에 싣되 가둔다", () => {
    it("0은 최소 지름 — 크기로 아무 말도 안 한다", () => {
        expect(leafSize(0, 12).d).toBe(DOT_MIN);
        expect(leafSize(0, 12).scale).toBe(0);
    });

    it("최댓값은 최대 지름", () => {
        expect(leafSize(12, 12).d).toBe(DOT_MAX);
        expect(leafSize(12, 12).scale).toBe(1);
    });

    it("제곱근이라 중간값이 선형보다 크다 — 작은 차이도 보이되 큰 값이 화면을 안 잡아먹는다", () => {
        const mid = leafSize(3, 12).d;
        const linear = DOT_MIN + (DOT_MAX - DOT_MIN) * (3 / 12);
        expect(mid).toBeGreaterThan(linear);
        expect(mid).toBeLessThan(DOT_MAX);
    });

    it("전부 0이면(빈 모집단) 전부 최소 — 0/0 이 NaN 이 되지 않는다", () => {
        expect(leafSize(0, 0).d).toBe(DOT_MIN);
    });

    it("상자는 원과 라벨을 함께 감싼다 — 레이아웃이 라벨을 알아야 컨테이너가 안 자른다", () => {
        const s = leafSize(12, 12);
        expect(s.h).toBe(s.d + LABEL_H);
        expect(s.w).toBe(Math.max(s.d, LABEL_W));
    });

    it("작은 원이어도 폭은 라벨 칸을 지킨다", () => {
        expect(leafSize(0, 12).w).toBe(LABEL_W);
    });
});

describe("layoutMap — 잎", () => {
    it("저장 중심을 왼쪽위로 바꿔 주어진 크기로 놓는다", () => {
        const [n] = layoutMap([item("a", 100, 50)]);
        expect(n).toMatchObject({
            id: "a", container: false, depth: 0,
            position: { x: 100 - LEAF_W / 2, y: 50 - LEAF_H / 2 },
            width: LEAF_W, height: LEAF_H,
        });
        expect(n!.parentId).toBeUndefined();
    });

    it("잎마다 크기가 다르다 — 수가 크기를 정하므로", () => {
        const laid = layoutMap([item("a", 0, 0, null, 104, 52), item("b", 300, 0, null, 160, 96)]);
        expect(laid.find((n) => n.id === "a")!.width).toBe(104);
        expect(laid.find((n) => n.id === "b")!.height).toBe(96);
    });

    it("잎의 원 지름은 라벨을 뺀 높이 — 노드가 이걸로 원을 그린다", () => {
        const s = leafSize(5, 12);
        const [n] = layoutMap([item("a", 0, 0, null, s.w, s.h)]);
        expect(n!.dot).toBe(s.d);
    });

    it("컨테이너는 원이 없다", () => {
        const laid = layoutMap([item("p", 0, 0), item("c", 0, 0, "p")]);
        expect(laid.find((n) => n.id === "p")!.dot).toBe(0);
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
