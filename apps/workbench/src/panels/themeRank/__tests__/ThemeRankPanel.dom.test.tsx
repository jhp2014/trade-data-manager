// 테마 순위 패널 — **연동 거울**의 배선. 산점·컷선의 기하는 browser-verifier 실측이 재고(캔버스),
// 여기서 재는 건 연동 상태의 왕복이다: 행 목록 → 칩, 칩 클릭 → 연동 전환, 행 0/꺼짐의 정직한 말.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_STRENGTH } from "../../../lib/themeStrength.js";
import { THEME_LINK_KEY, THEME_LINK_SCOPE } from "../../filter/themeLink.js";
import { ThemeRankPanel } from "../ThemeRankPanel.js";

const SEED: Seed = { points: [] };

const renderPanel = (): ReturnType<typeof render> =>
    render(<ThemeRankPanel />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const addThemeRow = (over: Partial<typeof DEFAULT_THEME_STRENGTH> = {}): string => {
    act(() => useWorkbench.getState().addFilterStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH, ...over } }]));
    const stages = selectFilterStages(useWorkbench.getState());
    return stages[stages.length - 1]!.id;
};

const linkedStored = (): unknown => useWorkbench.getState().sessionUi[THEME_LINK_SCOPE]?.[THEME_LINK_KEY];

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [], sessionUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("행 0 — 조건이 없다는 사실을 그대로 말한다", () => {
    it("칩도 컷선 안내도 없이 '행 없음' 문구만", () => {
        const { container } = renderPanel();
        expect(container.textContent).toContain("테마 조건 행 없음");
        expect([...container.querySelectorAll("button")].filter((b) => b.title.includes("이 행을 비추기"))).toHaveLength(0);
    });
});

describe("칩 스트립 — 행 목록의 파생 뷰, 클릭 = 연동 전환", () => {
    it("행이 서면 칩이 서고, 기록이 없으면 첫 행이 자동 연동된다", () => {
        const a = addThemeRow();
        const { container } = renderPanel();
        const chips = [...container.querySelectorAll("button")].filter((b) => b.title.includes("연동 중") || b.title.includes("이 행을 비추기"));
        expect(chips).toHaveLength(1);
        expect(chips[0]!.title).toContain("연동 중"); // 자동 연동
        expect(container.textContent).toContain("존 30/40 · 등락"); // 요약 표기 = 보드·막대와 같은 한 벌
        expect(a).toBeTruthy();
    });

    it("다른 칩을 누르면 연동이 갈아타고, 연동 칩을 다시 누르면 해제된다", () => {
        addThemeRow();
        const b = addThemeRow({ zoneRateN: 11, zoneAmountN: 22 });
        const { container } = renderPanel();
        const chipOf = (text: string): HTMLButtonElement =>
            [...container.querySelectorAll("button")].find((x) => x.textContent?.includes(text)) as HTMLButtonElement;
        act(() => { fireEvent.click(chipOf("존 11/22")); });
        expect(linkedStored()).toBe(b);
        act(() => { fireEvent.click(chipOf("존 11/22")); });
        expect(linkedStored()).toBeNull(); // 명시적 해제 = 순수 산점
        expect(container.textContent).toContain("연동 없음");
    });

    it("연동 행이 지워지면 남은 행으로 옮겨 간다 — 죽은 참조를 비추지 않는다", () => {
        const a = addThemeRow();
        const b = addThemeRow({ zoneRateN: 11 });
        const { container } = renderPanel();
        act(() => { useWorkbench.getState().setSessionUi(THEME_LINK_SCOPE, THEME_LINK_KEY, b); });
        act(() => { useWorkbench.getState().removeFilterStage(b); });
        expect(linkedStored()).toBe(a);
        expect(container.textContent).not.toContain("존 11/40");
    });
});

describe("꺼진 행 연동 — 탐색 상태를 화면이 말한다", () => {
    it("'꺼짐' 배지가 선다(깔때기 숫자와 패널 숫자가 다른 이유)", () => {
        const a = addThemeRow();
        act(() => { useWorkbench.getState().toggleFilterStage(a); });
        const { container } = renderPanel();
        expect(container.textContent).toContain("꺼짐");
    });
});
