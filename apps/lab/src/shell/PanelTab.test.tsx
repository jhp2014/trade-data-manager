// 패널 탭 — 경로 칩은 경로 이름만(점선 = 활성을 따라감, 실선 채움 = 고정), 복제 버튼 없음, 최소화는 마우스를 올릴 때만.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { usePaths } from "../store/paths.js";
import { useRowNav } from "../store/rowNav.js";
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
    useRowNav.setState({ attached: null });
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

    it("탭 우클릭 → 「w/s 부착」 켜기/끄기 — 부착된 판 탭엔 ● 하나, 부착은 늘 하나", () => {
        render(<PanelTab {...props("board-1")} />);
        expect(document.querySelector("[data-walk-mark]")).toBeNull();
        fireEvent.contextMenu(screen.getByText("테마 보드 (1)"));
        fireEvent.click(screen.getByRole("menuitem", { name: /w\/s 부착/ }));
        expect(useRowNav.getState().attached).toBe("board-1");
        expect(document.querySelector("[data-walk-mark]")?.textContent).toBe("●");
        expect(screen.queryByRole("menuitem")).toBeNull(); // 누르면 닫힌다
        act(() => useRowNav.getState().attach("board-2")); // 다른 판을 부착하면 이 판은 꺼진다
        expect(document.querySelector("[data-walk-mark]")).toBeNull();
        act(() => useRowNav.getState().attach("board-1"));
        fireEvent.contextMenu(screen.getByText("테마 보드 (1)"));
        fireEvent.click(screen.getByRole("menuitem", { name: /w\/s 부착/ }));
        expect(useRowNav.getState().attached).toBeNull();
    });

    it("걸을 수 없는 판은 메뉴 줄이 흐리고 눌러도 부착되지 않는다", () => {
        render(<PanelTab {...props("chart-1")} />);
        fireEvent.contextMenu(screen.getByText("차트 (1)"));
        const item = screen.getByRole("menuitem", { name: /w\/s 부착/ });
        expect(item.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(item);
        expect(useRowNav.getState().attached).toBeNull();
    });

    it("우클릭은 활성 경로를 바꾸지 않고, 메뉴가 열린 채 탭을 누르면 메뉴만 닫힌다", () => {
        usePaths.getState().bind("board-1", "B");
        render(<PanelTab {...props("board-1")} />);
        const tab = screen.getByText("테마 보드 (1)");
        fireEvent.pointerDown(tab, { button: 2 });
        fireEvent.contextMenu(tab);
        expect(usePaths.getState().active).toBe("A");
        expect(screen.getByRole("menuitem", { name: /w\/s 부착/ })).toBeTruthy();
        fireEvent.pointerDown(tab, { button: 0 });
        expect(screen.queryByRole("menuitem", { name: /w\/s 부착/ })).toBeNull();
        expect(usePaths.getState().active).toBe("B"); // 왼쪽 누름은 여전히 고르기
    });

    it("경로 메뉴 위 우클릭은 탭 메뉴를 겹쳐 열지 않는다", () => {
        render(<PanelTab {...props("board-1")} />);
        fireEvent.click(screen.getByTitle("활성을 따라감 — 지금 A"));
        fireEvent.contextMenu(screen.getByText("경로 B"));
        expect(screen.queryByRole("menuitem", { name: /w\/s 부착/ })).toBeNull();
    });

    it("넘침 목록(드롭다운) 속 탭은 우클릭 메뉴를 열지 않는다", () => {
        render(<PanelTab {...({ ...props("board-1"), tabLocation: "headerOverflow" } as IDockviewPanelHeaderProps)} />);
        fireEvent.contextMenu(screen.getByText("테마 보드 (1)"));
        expect(screen.queryByRole("menuitem", { name: /w\/s 부착/ })).toBeNull();
    });
});

