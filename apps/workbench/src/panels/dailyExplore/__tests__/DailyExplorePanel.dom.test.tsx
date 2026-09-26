// 일별 타점[탐색] — 머리(날짜·조건 그룹)와 조건 그룹 고르기 판. 평가 자체(●/·)는 순수부 테스트가 잠근다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { exprOfStages } from "../../filter/expr.js";
import { DailyExplorePanel } from "../DailyExplorePanel.js";

const SEED: Seed = { candidateDays: [], points: [] };
const PANEL = "daily-explore-1";
const RESET = { funnelSelection: null, savedSets: [], editingSetId: "edit", editPath: ["edit"], sessionUi: {}, themeBindings: {}, panelUi: {}, filterMode: "daily" as const };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

const renderExplore = (): ReturnType<typeof render> =>
    render(<DailyExplorePanel panelId={PANEL} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const ref = (setId: string) => ({ kind: "ref" as const, id: `r-${setId}`, setId });

describe("DailyExplorePanel", () => {
    it("조건이 없으면 평가하지 않고 그렇다고 말한다 — 날짜 머리는 선다", () => {
        const { container } = renderExplore();
        expect(container.textContent).toContain("평가할 조건이 없습니다");
        expect(container.textContent).toContain(useWorkbench.getState().focus.date);
        expect(container.textContent).toContain("날짜 고정");
    });

    it("조건 그룹 기본 = 보는 집합의 최상위 부품(자동) — 고르기 판에서 손으로 굳히면 영속", () => {
        useWorkbench.setState({
            savedSets: [
                { id: "edit", expr: { id: "root", of: [ref("a"), ref("b")], ops: ["or" as const], groups: [] }, universe: "daily" as const },
                { id: "a", name: "아침돌파", expr: exprOfStages([]), universe: "daily" as const },
                { id: "b", name: "눌림", expr: exprOfStages([]), universe: "daily" as const },
                { id: "c", name: "대금", expr: exprOfStages([]), universe: "daily" as const },
            ],
        });
        const { container, baseElement } = renderExplore();
        const groupsBtn = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("조건 그룹"))!;
        expect(groupsBtn.textContent).toContain("조건 그룹 2"); // 자동 = a, b

        act(() => { fireEvent.click(groupsBtn); });
        const item = (text: string): HTMLButtonElement =>
            [...baseElement.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").includes(text))!;
        expect(item("자동").textContent).toContain("✓");
        act(() => { fireEvent.click(item("대금")); });
        // 손으로 고르는 순간 현재 목록(a,b) + 대금으로 굳는다.
        expect(useWorkbench.getState().panelUi[PANEL]?.["exploreGroups"]).toEqual(["a", "b", "c"]);
        expect(item("자동").textContent).not.toContain("✓");
        act(() => { fireEvent.click(item("아침돌파")); });
        expect(useWorkbench.getState().panelUi[PANEL]?.["exploreGroups"]).toEqual(["b", "c"]);
    });

    it("지워진 선택 id 는 상한 5를 못 채운다 — 열 수·판이 산 것만 센다", () => {
        useWorkbench.setState({
            savedSets: [
                { id: "edit", expr: exprOfStages([]), universe: "daily" as const },
                { id: "a", name: "아침돌파", expr: exprOfStages([]), universe: "daily" as const },
                { id: "b", name: "눌림", expr: exprOfStages([]), universe: "daily" as const },
            ],
            panelUi: { [PANEL]: { exploreGroups: ["ghost1", "ghost2", "ghost3", "ghost4", "a"] } },
        });
        const { container, baseElement } = renderExplore();
        const groupsBtn = [...container.querySelectorAll("button")].find((btn) => (btn.textContent ?? "").includes("조건 그룹"))!;
        expect(groupsBtn.textContent, "산 것만 열로").toContain("조건 그룹 1");
        act(() => { fireEvent.click(groupsBtn); });
        const item = [...baseElement.querySelectorAll<HTMLButtonElement>("button")].find((btn) => (btn.textContent ?? "").includes("눌림"))!;
        expect(item.disabled, "유령 4 + 산 1 이 상한을 채운 척하면 안 된다").toBe(false);
        act(() => { fireEvent.click(item); });
        // 토글 한 번이 걸러진 목록으로 다시 쓴다 — 유령이 청소된다.
        expect(useWorkbench.getState().panelUi[PANEL]?.["exploreGroups"]).toEqual(["a", "b"]);
    });
});
