// 테마 강도 통계 훅 — **모듈 레벨 1-엔트리 캐시**의 회귀선. 이 파일의 존재 이유(보드·패널 두 소비자가
// 같은 무거운 패스를 한 번만 돈다)와, 캐시가 임계값 변경을 놓쳐 낡은 카운트를 돌려주는 사고(화면은
// 멀쩡하고 다른 테스트는 전부 초록인 종류)를 여기서 잡는다.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { RankSectionBundle } from "@trade-data-manager/wire";
import { Providers, seededClient, type Seed } from "../../test/renderPanel.js";

vi.mock("../themeStrength.js", async (importOriginal) => {
    const m = await importOriginal<typeof import("../themeStrength.js")>();
    return { ...m, countPassing: vi.fn(m.countPassing) };
});
import { countPassing, DEFAULT_THEME_STRENGTH, type ThemeStrengthParams } from "../themeStrength.js";
import { useThemeStrengthStats } from "../useThemeStrengthStats.js";

const DATE = "2026-08-14";
const TIME = "09:30";

const bundle: RankSectionBundle = {
    version: 1,
    dates: [{
        date: DATE,
        sealed: true,
        codes: ["000001", "000002", "000003"],
        sections: [{ time: TIME, n: 3, rate: [1, 2, 3], amount: [2, 1, 3] }],
    }],
    pending: [],
};

const SEED: Seed = {
    points: [{ stockCode: "000001", date: DATE, time: `${TIME}:00` }],
    rankSections: bundle,
    themeMembers: [{ theme: "T", code: "000001" }, { theme: "T", code: "000002" }],
};

const P = (over: Partial<ThemeStrengthParams> = {}): ThemeStrengthParams => ({ ...DEFAULT_THEME_STRENGTH, ...over });

describe("useThemeStrengthStats — 모듈 캐시", () => {
    beforeEach(() => { vi.mocked(countPassing).mockClear(); });

    it("두 소비자가 같은 params 로 불러도 무거운 패스는 한 번", () => {
        const client = seededClient(SEED);
        const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <Providers client={client}>{children}</Providers>;
        const params = P({ countOn: true, countMin: 2 });
        const a = renderHook(() => useThemeStrengthStats(params), { wrapper });
        const calls = vi.mocked(countPassing).mock.calls.length;
        const b = renderHook(() => useThemeStrengthStats(params), { wrapper });
        expect(vi.mocked(countPassing).mock.calls.length).toBe(calls); // 두 번째 소비자 = 캐시 적중
        expect(b.result.current.passed).toBe(a.result.current.passed);
        expect(a.result.current.evaluable).toBe(1);
    });

    it("임계값이 바뀌면 낡은 캐시를 돌려주지 않는다 — 값까지 달라져야 한다", () => {
        const client = seededClient(SEED);
        const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <Providers client={client}>{children}</Providers>;
        // 동료 ≥ 2: 존(30/40) 안에 T 멤버 둘 → 통과. 동료 ≥ 3: 멤버가 둘뿐 → 불통과.
        const loose = renderHook(() => useThemeStrengthStats(P({ countOn: true, countMin: 2 })), { wrapper });
        expect(loose.result.current.passed).toBe(1);
        const before = vi.mocked(countPassing).mock.calls.length;
        const strict = renderHook(() => useThemeStrengthStats(P({ countOn: true, countMin: 3 })), { wrapper });
        expect(vi.mocked(countPassing).mock.calls.length).toBeGreaterThan(before); // params 갈림 = 재계산
        expect(strict.result.current.passed).toBe(0);
    });

    it("반환은 카운트 3항 + 상태 둘뿐 — 옛 틱 재료는 소비자가 없어 폐지됐다", () => {
        const client = seededClient(SEED);
        const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <Providers client={client}>{children}</Providers>;
        const { result } = renderHook(() => useThemeStrengthStats(P()), { wrapper });
        expect(Object.keys(result.current).sort()).toEqual(["error", "evaluable", "isLoading", "missing", "passed"]);
    });
});
