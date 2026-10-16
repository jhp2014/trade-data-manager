// 패널 탭 — 경로 칩은 경로 이름만(점선 = 활성을 따라감, 실선 채움 = 고정), 복제 버튼 없음, 최소화는 마우스를 올릴 때만.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { usePaths } from "../store/paths.js";
import { PanelTab } from "./PanelTab.js";

let closed = 0;
const noop = { dispose: () => {} };
const props = (id: string) =>
    ({
        api: { id, isActive: true, isVisible: true, onDidActiveChange: () => noop, onDidVisibilityChange: () => noop, close: () => closed++ },
        containerApi: {},
    }) as unknown as IDockviewPanelHeaderProps;

beforeEach(() => {
    closed = 0;
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
});
afterEach(cleanup);

describe("PanelTab", () => {
    it("활성을 따라가면 점선 칩에 지금 경로 이름만 — 고정하면 실선 채움", () => {
        const { unmount } = render(<PanelTab {...props("chart-1")} />);
        const chip = screen.getByTitle("활성을 따라감 — 지금 A");
        expect(chip.textContent).toBe("A");
        expect(chip.style.border).toContain("dashed");
        unmount();
        usePaths.getState().bind("chart-1", "B");
        render(<PanelTab {...props("chart-1")} />);
        const fixed = screen.getByTitle("경로 B 에 고정");
        expect(fixed.textContent).toBe("B");
        expect(fixed.style.border).toContain("solid");
    });

    it("탭을 누르면 그 패널이 보는 경로가 활성(고정된 패널만)", () => {
        usePaths.getState().bind("chart-2", "B");
        render(<PanelTab {...props("chart-2")} />);
        fireEvent.pointerDown(screen.getByText("차트 (2)"));
        expect(usePaths.getState().active).toBe("B");
    });

    it("탭 안 버튼(최소화 · 경로 칩) 누름은 고르기가 아니다 — 활성은 그대로", () => {
        usePaths.getState().bind("chart-2", "B");
        render(<PanelTab {...props("chart-2")} />);
        fireEvent.pointerDown(screen.getByTitle(/^최소화/));
        fireEvent.pointerDown(screen.getByTitle("경로 B 에 고정"));
        expect(usePaths.getState().active).toBe("A");
    });

    it("복제 버튼은 없고, 최소화는 마우스를 올릴 때만 자리를 펴고 나오는 버튼(.hover-reveal)", () => {
        render(<PanelTab {...props("chart-1")} />);
        expect(screen.queryByText("⧉")).toBeNull();
        const min = screen.getByTitle(/^최소화/);
        expect(min.className).toBe("hover-reveal");
        expect(min.closest(".hover-host")).toBeTruthy();
        fireEvent.click(min);
        expect(closed).toBe(1);
    });
});
