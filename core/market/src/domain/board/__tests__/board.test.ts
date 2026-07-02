import { describe, it, expect } from "vitest";
import { stocksByTheme, themeParents } from "../roster.js";
import { selectHotUniverse } from "../ranking.js";

describe("stocksByTheme", () => {
    it("테마별로 묶고 등락률 desc 정렬", () => {
        const stocks = [
            { code: "A", themes: ["마스크", "코로나"], changeRate: 3 },
            { code: "B", themes: ["코로나"], changeRate: 10 },
            { code: "C", themes: ["마스크"], changeRate: 5 },
        ];
        const m = stocksByTheme(stocks);
        expect(m.get("코로나")!.map((s) => s.code)).toEqual(["B", "A"]); // 10 > 3
        expect(m.get("마스크")!.map((s) => s.code)).toEqual(["C", "A"]); // 5 > 3
    });
});

describe("themeParents", () => {
    it("멤버가 전부 상위 테마에 포함되면 부모로 잡는다(마스크 ⊆ 코로나)", () => {
        // 마스크 = {A,B}, 코로나 = {A,B,C} → 마스크 ⊆ 코로나
        const byTheme = new Map<string, { code: string }[]>([
            ["마스크", [{ code: "A" }, { code: "B" }]],
            ["코로나", [{ code: "A" }, { code: "B" }, { code: "C" }]],
        ]);
        const parents = themeParents(byTheme);
        expect(parents.get("마스크")).toEqual(["코로나"]);
        expect(parents.has("코로나")).toBe(false); // 더 큰 상위 없음
    });

    it("부분 겹침은 포함관계 아님", () => {
        const byTheme = new Map<string, { code: string }[]>([
            ["X", [{ code: "A" }, { code: "B" }]],
            ["Y", [{ code: "B" }, { code: "C" }]],
        ]);
        expect(themeParents(byTheme).size).toBe(0);
    });
});

describe("selectHotUniverse", () => {
    it("거래대금 top ∪ 등락률 top 합집합", () => {
        const stocks = [
            { code: "big1", amount: 100, changeRate: 1 },
            { code: "big2", amount: 90, changeRate: 2 },
            { code: "hot1", amount: 1, changeRate: 30 },
            { code: "hot2", amount: 2, changeRate: 29 },
            { code: "none", amount: 3, changeRate: 3 },
        ];
        const hot = selectHotUniverse(stocks, 2, 2); // 거래대금 top2 = big1,big2 / 등락률 top2 = hot1,hot2
        expect(hot).toEqual(new Set(["big1", "big2", "hot1", "hot2"]));
        expect(hot.has("none")).toBe(false);
    });
});
