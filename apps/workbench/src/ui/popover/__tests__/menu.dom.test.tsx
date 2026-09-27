// 메뉴 줄 규약(menu.tsx) — 표식 칸·못 누르는 이유·고른 줄 표시가 판마다 갈리지 않게 한 벌에서 잰다.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MenuItem } from "../menu.js";

afterEach(cleanup);

describe("MenuItem", () => {
    it("못 누르는 항목은 숨기지 않고 회색 + 이유(툴팁) — 눌러도 아무 일 없다", () => {
        const onClick = vi.fn();
        const { getByRole } = render(<MenuItem onClick={onClick} disabled why="NOT 이 갈 곳이 없다" title="평소 설명">괄호 풀기</MenuItem>);
        const b = getByRole("menuitem") as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        expect(b.title).toBe("NOT 이 갈 곳이 없다");
        fireEvent.click(b);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("표식 칸은 꺼져 있어도 자리를 지킨다 — 켜고 끌 때 글자가 안 밀린다", () => {
        const { container, rerender } = render(<MenuItem mark="check" on={false} onClick={() => {}}>NOT</MenuItem>);
        const slot = (): HTMLElement => container.querySelector("[aria-hidden]") as HTMLElement;
        expect(slot()).toBeTruthy();
        expect(slot().textContent).toBe("");
        rerender(<MenuItem mark="check" on onClick={() => {}}>NOT</MenuItem>);
        expect(slot().textContent).toBe("✓");
    });

    it("라디오는 ●○ — 하나 고르기", () => {
        const { container } = render(<><MenuItem mark="radio" on onClick={() => {}}>가</MenuItem><MenuItem mark="radio" onClick={() => {}}>나</MenuItem></>);
        expect([...container.querySelectorAll("[aria-hidden]")].map((e) => e.textContent)).toEqual(["●", "○"]);
    });

    it("고른 줄·무장한 줄은 배경을 인라인이 아니라 data 속성으로 — CSS 가 칠해야 :hover 가 산다", () => {
        const { getAllByRole } = render(<><MenuItem selected onClick={() => {}}>가</MenuItem><MenuItem armed onClick={() => {}}>정말 지우기</MenuItem></>);
        const [sel, armed] = getAllByRole("menuitem");
        expect(sel!.hasAttribute("data-selected")).toBe(true);
        expect(armed!.hasAttribute("data-armed")).toBe(true);
        expect(sel!.style.background).toBe("");
        expect(armed!.style.background).toBe("");
    });

    it("onClick 은 이벤트를 받는다 — ＋ 조건이 그 좌표로 편집기를 띄운다", () => {
        const onClick = vi.fn();
        const { getByRole } = render(<MenuItem onClick={onClick} hint="설명">캔들</MenuItem>);
        fireEvent.click(getByRole("menuitem"), { clientX: 120, clientY: 40 });
        expect(onClick.mock.calls[0]![0]).toMatchObject({ clientX: 120, clientY: 40 });
    });
});
