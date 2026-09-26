// 관찰판(테마 순위 [관찰]) — 축 자유·연동 원리적 부재의 배선. 기하는 실측 몫이고 여기선:
// 축 ▾ 팝오버 왕복(임의 분 입력 → panelUi 영속), 연동/판정 UI 가 아예 없다는 사실.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_STRENGTH } from "../../../lib/themeStrength.js";
import { ThemeScopePanel } from "../ThemeScopePanel.js";

const SEED: Seed = { points: [] };
const PANEL = "theme-scope-1";

const renderPanel = (): ReturnType<typeof render> =>
    render(<ThemeScopePanel panelId={PANEL} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const RESET = { filterStages: [], funnelSelection: null, savedSets: [], sessionUi: {}, themeBindings: {}, panelUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("관찰판 — 연동·판정이 원리적으로 없다", () => {
    it("테마 행+바인딩이 있어도 연동 배지·조건 ▾·카운트가 안 선다(이 판은 목록 밖)", () => {
        act(() => useWorkbench.getState().addFilterStage([{ kind: "themeStrength", params: DEFAULT_THEME_STRENGTH }]));
        const { container } = renderPanel();
        expect(container.textContent).toContain("관찰 — 판정 없음");
        expect(container.textContent).not.toContain("조건 ▾");
        expect(container.textContent).not.toContain("통과");
        expect(container.textContent).not.toContain("미연동"); // "미연동"조차 조건판의 말이다
    });
});

describe("축 ▾ — 창 임의 분 입력이 인스턴스 영속으로 커밋된다", () => {
    it("45분 입력(Enter) → panelUi axes.windowMin=45, 헤더 요약이 따라온다", () => {
        const { container } = renderPanel();
        const trigger = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("축:"))!;
        act(() => { fireEvent.click(trigger); });
        const input = document.body.querySelector("input")!;
        act(() => {
            fireEvent.change(input, { target: { value: "45" } });
            fireEvent.keyDown(input, { key: "Enter" });
        });
        expect((useWorkbench.getState().panelUi[PANEL]?.["axes"] as { windowMin?: number }).windowMin).toBe(45);
        expect(container.textContent).toContain("45분");
    });

    it("모드 택(등락 값) → 저장 + 요약 반영", () => {
        const { container } = renderPanel();
        const trigger = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("축:"))!;
        act(() => { fireEvent.click(trigger); });
        // 팝오버의 "등락" 줄 안 "값" 버튼 — 줄(span)로 좁혀 찾는다.
        const row = [...document.body.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith("등락순위값"))
            ?? [...document.body.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith("등락"));
        const btn = [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "값")!;
        act(() => { fireEvent.click(btn); });
        expect((useWorkbench.getState().panelUi[PANEL]?.["axes"] as { yMode?: string }).yMode).toBe("value");
    });
});
