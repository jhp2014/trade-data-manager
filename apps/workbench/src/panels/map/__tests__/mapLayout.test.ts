import { describe, it, expect } from "vitest";
import {
    absCenterOf, BOX_HEADER, BOX_PAD, dropTargetAt, LEAF_H as LEAF_H_CONST, LEAF_MAX_W, LEAF_MIN_W,
    layoutMap, leafSize, sidesBetween, textWidth, type LayoutItem,
} from "../mapLayout.js";

/** 기본 잎 — 크기는 호출부가 주는 값이라 테스트는 고정치를 쓴다(레이아웃은 크기의 출처를 모른다). */
const LEAF_W = 120, LEAF_H = 50;
const item = (id: string, x: number, y: number, parentId: string | null = null, w = LEAF_W, h = LEAF_H): LayoutItem =>
    ({ id, parentId, x, y, w, h });

describe("textWidth — 측정 없이 자폭 어림", () => {
    it("한글이 영문보다 넓다", () => {
        expect(textWidth("가나")).toBeGreaterThan(textWidth("ab"));
    });

    it("빈 문자열은 0", () => {
        expect(textWidth("")).toBe(0);
    });
});

describe("leafSize — 폭은 이름만 따른다", () => {
    it("높이는 한 줄 고정", () => {
        expect(leafSize("아무거나").h).toBe(LEAF_H_CONST);
    });

    it("이름이 길수록 넓다", () => {
        expect(leafSize("타입: 재돌파[S]").w).toBeGreaterThan(leafSize("돌파").w);
    });

    it("짧은 이름도 최소 폭을 지킨다", () => {
        expect(leafSize("A").w).toBe(LEAF_MIN_W);
    });

    it("아주 긴 이름은 상한에서 멈춘다 — 나머지는 말줄임이 받는다", () => {
        expect(leafSize("아주아주아주아주아주아주아주 긴 그룹 이름입니다").w).toBe(LEAF_MAX_W);
    });

    // 수가 폭에 들어가면 필터를 걸 때마다 상자가 들썩이고, 그 움직임이 뜻 없는 신호가 된다.
    it("수는 폭에 영향을 주지 않는다 — 인자로 받지도 않는다", () => {
        expect(leafSize.length).toBe(1);
    });
});

describe("sidesBetween — 마주 보는 변끼리 잇는다", () => {
    const box = (x: number, y: number) => ({ x, y, w: 100, h: 34 });

    it("오른쪽에 있으면 r→l", () => {
        expect(sidesBetween(box(0, 0), box(400, 0))).toEqual({ source: "r", target: "l" });
    });

    it("왼쪽에 있으면 l→r", () => {
        expect(sidesBetween(box(400, 0), box(0, 0))).toEqual({ source: "l", target: "r" });
    });

    it("아래에 있으면 b→t", () => {
        expect(sidesBetween(box(0, 0), box(0, 300))).toEqual({ source: "b", target: "t" });
    });

    it("위에 있으면 t→b — 위/아래 두 개만 두면 여기서 고리가 생겼다(꼬임의 원인)", () => {
        expect(sidesBetween(box(0, 300), box(0, 0))).toEqual({ source: "t", target: "b" });
    });

    it("대각선은 더 긴 축이 이긴다", () => {
        expect(sidesBetween(box(0, 0), box(400, 100)).source).toBe("r");
        expect(sidesBetween(box(0, 0), box(100, 400)).source).toBe("b");
    });

    it("완전히 겹쳐도 답을 낸다 — 화면이 멈추지 않게", () => {
        expect(sidesBetween(box(0, 0), box(0, 0))).toEqual({ source: "r", target: "l" });
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

    it("잎마다 폭이 다를 수 있다 — 이름 길이가 정하므로", () => {
        const laid = layoutMap([item("a", 0, 0, null, 104, 34), item("b", 300, 0, null, 160, 34)]);
        expect(laid.find((n) => n.id === "a")!.width).toBe(104);
        expect(laid.find((n) => n.id === "b")!.width).toBe(160);
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
