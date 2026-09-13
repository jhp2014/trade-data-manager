// 타점 정보 순서·숨김 **청소 가드**의 회귀선 — 이 작업의 지목된 사고 지점이다.
// 순수 규칙(pruneRowKeys·moveRow)은 prefs.test.ts 가 덮고, 여긴 **언제 도느냐**만 본다: 재료가
// 서로 다른 시각에 도착하는데 가드가 하나라도 빠지면 사용자 순서·숨김이 조용히 날아간다
// (시트가 같은 채널을 useSheetColumns.dom.test.tsx 로 붙잡고 있는 것과 같은 자리).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { HIDDEN_KEY, ORDER_KEY } from "../prefs.js";
import { usePointInfoPrefs } from "../usePointInfoPrefs.js";

const SEED = ["ax:c:live", "ax:c:dead", "th:반도체", "th:사라진테마"];
type Live = Parameters<typeof usePointInfoPrefs>[1];

const seed = (): void => {
    localStorage.setItem(ORDER_KEY, JSON.stringify(SEED));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(SEED));
};
const stored = (key: string): string[] => JSON.parse(localStorage.getItem(key) ?? "[]");

const LOADED: Live = { axisKeys: ["c:live"], allThemes: ["반도체"], isLoading: false };

beforeEach(() => { localStorage.clear(); seed(); });
afterEach(() => localStorage.clear());

describe("usePointInfoPrefs — 청소 가드", () => {
    it("재료가 오는 중엔 아무것도 안 지운다(로딩 · 축 미도착 · 테마 미도착 각각).", () => {
        for (const live of [
            { axisKeys: ["c:live"], allThemes: ["반도체"], isLoading: true }, // 로딩
            { axisKeys: [], allThemes: ["반도체"], isLoading: false }, // 축 미도착
            { axisKeys: ["c:live"], allThemes: null, isLoading: false }, // 테마 미도착
        ] satisfies Live[]) {
            localStorage.clear();
            seed();
            renderHook(() => usePointInfoPrefs([], live));
            expect(stored(ORDER_KEY)).toEqual(SEED);
            expect(stored(HIDDEN_KEY)).toEqual(SEED);
        }
    });

    it("⚠ 테마가 **빈 배열**로 와도 안 지운다 — 미러가 비었거나 응답이 일시적으로 `[]` 인 경우가 실재하고, 그때 지우면 되돌릴 수 없다.", () => {
        renderHook(() => usePointInfoPrefs([], { axisKeys: ["c:live"], allThemes: [], isLoading: false }));
        expect(stored(ORDER_KEY)).toEqual(SEED);
    });

    it("둘 다 도착하면 죽은 키만 지운다 — 산 키는 자리를 지킨다.", () => {
        renderHook(() => usePointInfoPrefs([], LOADED));
        expect(stored(ORDER_KEY)).toEqual(["ax:c:live", "th:반도체"]);
        expect(stored(HIDDEN_KEY)).toEqual(["ax:c:live", "th:반도체"]);
    });

    it("늦게 도착해도 결과는 같다 — 중간 단계에서 지워지지만 않으면 된다.", () => {
        const { rerender } = renderHook(({ live }: { live: Live }) => usePointInfoPrefs([], live), {
            initialProps: { live: { axisKeys: [], allThemes: null, isLoading: true } as Live },
        });
        expect(stored(ORDER_KEY)).toEqual(SEED);
        rerender({ live: { axisKeys: ["c:live"], allThemes: null, isLoading: false } });
        expect(stored(ORDER_KEY)).toEqual(SEED); // 테마가 아직 — 여기서 지우면 th: 가 전멸한다
        rerender({ live: LOADED });
        expect(stored(ORDER_KEY)).toEqual(["ax:c:live", "th:반도체"]);
    });
});

describe("usePointInfoPrefs — 숨김", () => {
    it("'전부 되돌리기'는 **준 키만** 지운다 — 다른 종목에서 치운 줄을 같이 살리지 않는다.", () => {
        const { result } = renderHook(() => usePointInfoPrefs([], LOADED));
        act(() => result.current.unhideAll(["ax:c:live"]));
        expect(stored(HIDDEN_KEY)).toEqual(["th:반도체"]);
    });
});
