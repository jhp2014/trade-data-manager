import { describe, it, expect } from "vitest";
import type { Grouped } from "@trade-data-manager/market/domain";
import type { BoardStock } from "../BoardCard.js";
import { boardNavOrder, stepInList } from "../boardNavOrder.js";

const s = (code: string): BoardStock =>
    ({ code, name: code, market: "KOSPI", themes: [], changeRate: 0, openPct: 0, highPct: 0, lowPct: 0, amount: 0, isMover: false }) as unknown as BoardStock;

const grouped: Grouped<BoardStock> = {
    themes: [
        { theme: "A", stocks: [s("1"), s("2")] },
        { theme: "B", stocks: [s("2"), s("3")] }, // 2 는 A 에도 있다(중복 멤버)
        { theme: "C", stocks: [s("4")] },
    ],
    individuals: [s("5")],
    unclassified: [s("6")],
} as unknown as Grouped<BoardStock>;

const never = (): boolean => false;

describe("boardNavOrder", () => {
    it("카드 순서 × 멤버 순서, 첫 등장만 — 개별·미분류가 맨 뒤.", () => {
        expect(boardNavOrder(grouped, { favorites: [], isHidden: never })).toEqual(["1", "2", "3", "4", "5", "6"]);
    });

    it("즐겨찾기가 앞으로(사람이 정한 순), 숨김 카드는 빠진다.", () => {
        expect(boardNavOrder(grouped, { favorites: ["C"], isHidden: never })).toEqual(["4", "1", "2", "3", "5", "6"]);
        expect(boardNavOrder(grouped, { favorites: [], isHidden: (t) => t === "A" })).toEqual(["2", "3", "4", "5", "6"]);
    });

    it("개별·미분류 표시 토글을 따른다 — 안 보이면 안 걷는다.", () => {
        expect(boardNavOrder(grouped, { favorites: [], isHidden: never, showIndividuals: false, showUnclassified: false }))
            .toEqual(["1", "2", "3", "4"]);
    });

    it("즐겨찾기가 숨김이면 앞으로 안 나온다(목록에서 아예 빠진다).", () => {
        expect(boardNavOrder(grouped, { favorites: ["A"], isHidden: (t) => t === "A" })).toEqual(["2", "3", "4", "5", "6"]);
    });
});

describe("stepInList", () => {
    const list = ["a", "b", "c"];
    it("한 걸음씩, 양 끝에서 멈춘다.", () => {
        expect(stepInList(list, "a", 1)).toBe("b");
        expect(stepInList(list, "c", 1)).toBe("c");
        expect(stepInList(list, "a", -1)).toBe("a");
    });
    it("목록 밖(또는 선택 없음)이면 진행 방향의 끝에서 시작한다.", () => {
        expect(stepInList(list, null, 1)).toBe("a");
        expect(stepInList(list, "zz", -1)).toBe("c");
    });
    it("빈 목록은 null.", () => {
        expect(stepInList([], "a", 1)).toBeNull();
    });
});
