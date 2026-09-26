// 격자판 = 창(2026-09-25) — 연동 줄의 값만 비추고 고친다. 수·후보 목록은 없다(수는 조건판 머리글, 그림은 차트).
// 비출 줄이 없으면 편집면을 안 세운다 — 연동 없음과 "편집 집합 밖에 연동됨"은 다른 말이다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { exprOfStages } from "../../filter/expr.js";
import { seedEditing } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { DailyGridPanel } from "../DailyGridPanel.js";

const BO = { id: "t1", enabled: true, predicates: [{ kind: "breakout" as const, zigzagPct: 3, bandPct: 0.5, chain: { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 } }] };
const RESET = { funnelSelection: null, savedSets: [], editingSetId: "edit", editPath: ["edit"], sessionUi: {}, themeBindings: {}, filterMode: "daily" as const };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("DailyGridPanel", () => {
    it("연동 — 「▣ 조건판 연동」 + 두 층(줄의 값), 수·후보 목록은 없다", () => {
        seedEditing(exprOfStages([BO]));
        act(() => { useWorkbench.getState().bindTheme("t1", "daily-grid-1"); });
        const { container } = render(<DailyGridPanel panelId="daily-grid-1" />);
        expect(container.textContent).toContain("▣ 조건판 연동");
        expect(container.textContent).toContain("격자 정의");
        expect(container.textContent).toContain("사슬 필터");
        expect((container.querySelectorAll("input")[1] as HTMLInputElement).value).toBe("3"); // zigzag = 줄의 값
        expect(container.textContent).not.toContain("후보");
        expect(container.textContent).not.toContain("집합");
    });

    it("연동 없음 — 편집면 없이 연결 안내만(새로고침에 사라질 로컬 값을 만지게 하지 않는다)", () => {
        seedEditing(exprOfStages([BO]));
        const { container } = render(<DailyGridPanel panelId="daily-grid-1" />);
        expect(container.textContent).toContain("○ 연동 없음");
        expect(container.textContent).toContain("이 판을 쓰는 「돌파」 줄이 없습니다");
        expect(container.textContent).not.toContain("격자 정의");
    });

    it("연동된 줄이 편집 집합 밖이면 그렇다고 말한다(연동 없음이 아니다)", () => {
        seedEditing(exprOfStages([BO]));
        act(() => { useWorkbench.getState().bindTheme("t1", "daily-grid-1"); });
        // 편집 집합을 다른(빈) 집합으로 — 드릴인 중 윗집합의 줄이 연동된 모양.
        act(() => { useWorkbench.setState((s) => ({ savedSets: [...s.savedSets, { id: "other", expr: exprOfStages([]), universe: "daily" }], editingSetId: "other" })); });
        const { container } = render(<DailyGridPanel panelId="daily-grid-1" />);
        expect(container.textContent).toContain("▣ 조건판 연동");
        expect(container.textContent).toContain("편집 중인 집합 밖");
        expect(container.textContent).not.toContain("격자 정의");
    });
});
