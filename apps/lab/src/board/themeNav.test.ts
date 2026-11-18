import { describe, expect, it } from "vitest";
import { cardOrder, navCard, stepInCard, stepTheme } from "./themeNav.js";
import type { Grouped } from "./domain.js";
import type { BoardStock } from "./boardTypes.js";

const st = (code: string, isMover = false): BoardStock => ({ code, isMover, signal: null }) as unknown as BoardStock;
const grouped = (themes: Record<string, string[]>): Grouped<BoardStock> =>
    ({ themes: Object.entries(themes).map(([theme, codes]) => ({ theme, stocks: codes.map((c) => st(c)) })), individuals: [], unclassified: [] }) as Grouped<BoardStock>;

describe("cardOrder", () => {
    it("주도주 먼저, 나머지 뒤 — 카드에 보이는 순서", () => {
        expect(cardOrder([st("a"), st("b", true), st("c"), st("d", true)]).map((s) => s.code)).toEqual(["b", "d", "a", "c"]);
    });
});

describe("navCard", () => {
    const g = grouped({ 반도체: ["1", "2"], HBM: ["1", "3"], 조선: ["4", "5"] });
    it("선택 테마가 현재 종목의 테마면 그것", () => expect(navCard(g, "1", "HBM")?.theme).toBe("HBM"));
    it("선택 테마가 현재 종목의 테마가 아니면 현재 종목의 첫 테마", () => expect(navCard(g, "1", "조선")?.theme).toBe("반도체"));
    it("현재 종목이 테마 밖이면 선택 테마 카드 그대로", () => expect(navCard(g, "9", "조선")?.theme).toBe("조선"));
    it("둘 다 없으면 null", () => expect(navCard(g, "9", "")).toBeNull());
});

describe("stepInCard", () => {
    const stocks = [st("a"), st("b"), st("c")];
    it("한 줄씩, 끝에서 처음으로", () => {
        expect(stepInCard(stocks, "a", 1)).toBe("b");
        expect(stepInCard(stocks, "c", 1)).toBe("a");
        expect(stepInCard(stocks, "a", -1)).toBe("c");
    });
    it("현재 종목이 카드 밖이면 s = 첫 줄, w = 끝 줄", () => {
        expect(stepInCard(stocks, "z", 1)).toBe("a");
        expect(stepInCard(stocks, "z", -1)).toBe("c");
    });
    it("빈 카드면 null", () => expect(stepInCard([], "a", 1)).toBeNull());
});

describe("stepTheme", () => {
    it("테마들 사이 순환", () => {
        expect(stepTheme(["A", "B", "C"], "C", 1)).toBe("A");
        expect(stepTheme(["A", "B", "C"], "A", -1)).toBe("C");
    });
    it("테마가 하나면 바꿀 것이 없다", () => expect(stepTheme(["A"], "A", 1)).toBeNull());
    it("지금 테마가 목록 밖이면 바꾸지 않는다", () => {
        expect(stepTheme(["A", "B"], null, 1)).toBeNull();
        expect(stepTheme(["A", "B"], "Z", -1)).toBeNull();
    });
    it("테마가 없으면 null", () => expect(stepTheme([], null, 1)).toBeNull());
});
