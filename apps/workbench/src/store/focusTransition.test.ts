import { describe, it, expect } from "vitest";
import { transitionFocus, type ActivePoint, type FocusInvariants } from "./focusTransition.js";
import type { Focus, Scope, Search } from "./focusSlice.js";

const D1 = "2026-06-25";
const D2 = "2026-06-26";
const THEME: Scope = { theme: "반도체" };
const SEARCH: Search = { code: "A", date: D1 };
const AP: ActivePoint = { code: "A", date: D1, time: "10:00:00" };

const prev = (): FocusInvariants => ({
    focus: { date: D1, code: "A", time: "10:00:00" },
    scope: THEME,
    search: SEARCH,
    activePoint: AP,
});

// 표: next focus 로 갈 때 파생축이 어떻게 남/지워지는지. null=지워짐, 값=유지.
const cases: {
    name: string;
    next: Focus;
    scope: Scope;
    search: Search | null;
    activePoint: ActivePoint | null;
}[] = [
    {
        name: "동일 값(no-op) → 전부 유지",
        next: { date: D1, code: "A", time: "10:00:00" },
        scope: THEME,
        search: SEARCH,
        activePoint: AP,
    },
    {
        name: "날짜만 변경 → scope·activePoint 리셋, search 유지",
        next: { date: D2, code: "A", time: "10:00:00" },
        scope: { theme: null },
        search: SEARCH,
        activePoint: null,
    },
    {
        name: "종목만 변경 → search·activePoint 리셋, scope 유지",
        next: { date: D1, code: "B", time: "10:00:00" },
        scope: THEME,
        search: null,
        activePoint: null,
    },
    {
        name: "날짜+종목 변경 → 전부 리셋",
        next: { date: D2, code: "B", time: "10:00:00" },
        scope: { theme: null },
        search: null,
        activePoint: null,
    },
    {
        name: "시간만 변경 → 전부 유지(드리프트 안정)",
        next: { date: D1, code: "A", time: "11:00:00" },
        scope: THEME,
        search: SEARCH,
        activePoint: AP,
    },
];

describe("transitionFocus 무효화 규칙", () => {
    for (const c of cases) {
        it(c.name, () => {
            const patch = transitionFocus(prev(), c.next);
            expect(patch.focus).toEqual(c.next);
            expect(patch.scope).toEqual(c.scope);
            expect(patch.search).toEqual(c.search);
            expect(patch.activePoint).toEqual(c.activePoint);
        });
    }

    it("origin 전달 시 lastFocusOrigin 에 반영, 미전달은 null", () => {
        expect(transitionFocus(prev(), { date: D2, code: "A", time: null }, "chart-1").lastFocusOrigin).toBe("chart-1");
        expect(transitionFocus(prev(), { date: D2, code: "A", time: null }).lastFocusOrigin).toBeNull();
    });
});
