import { describe, expect, it } from "vitest";
import { evaluateSignal, isMover, relatedThemes, stocksByTheme, themeParents } from "./domain.js";

describe("1분 신호 경계", () => {
    it("정확히 +0.6%p · 정확히 60억이면 신호, 하나라도 모자라면 아니다", () => {
        expect(evaluateSignal(0.6, 6_000_000_000)).not.toBeNull();
        expect(evaluateSignal(0.59, 6_000_000_000)).toBeNull();
        expect(evaluateSignal(0.6, 5_999_999_999)).toBeNull();
    });
});

describe("주도주 경계", () => {
    it("시총 5조 이상은 3% 초과, 미만(또는 미상)은 5% 초과", () => {
        expect(isMover(50_000, 3)).toBe(false);
        expect(isMover(50_000, 3.01)).toBe(true);
        expect(isMover(49_999, 4.9)).toBe(false);
        expect(isMover(null, 5)).toBe(false);
        expect(isMover(null, 5.1)).toBe(true);
    });
});

describe("관련 테마", () => {
    // 반도체 ⊃ HBM(포함), 반도체·AI 는 부분 겹침, 소부장 은 멤버 1개라 관련 테마가 아니다.
    const stocks = [
        { code: "A", themes: ["반도체", "HBM", "AI"], changeRate: 9 },
        { code: "B", themes: ["반도체", "HBM"], changeRate: 8 },
        { code: "C", themes: ["반도체", "소부장"], changeRate: 7 },
        { code: "D", themes: ["AI"], changeRate: 6 },
    ];
    const byTheme = stocksByTheme(stocks);
    const parents = themeParents(byTheme);
    const rel = (home: string) => relatedThemes(home, byTheme.get(home)!, byTheme, parents);

    it("HBM 에서 보면 반도체는 상위(parent), AI 는 겹침(overlap)", () => {
        expect(rel("HBM")).toEqual([
            { theme: "반도체", kind: "parent" },
            { theme: "AI", kind: "overlap" },
        ]);
    });
    it("반도체에서 보면 HBM 은 하위(child) — parent → child → overlap 순, 멤버 1개 테마는 뺀다", () => {
        expect(rel("반도체")).toEqual([
            { theme: "HBM", kind: "child" },
            { theme: "AI", kind: "overlap" },
        ]);
    });
});
