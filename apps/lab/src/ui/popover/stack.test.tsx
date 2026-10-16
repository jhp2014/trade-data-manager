// 스택 규약 — 떠 있는 판들의 닫힘을 한 곳이 판정한다(stack.ts 머리 주석). workbench popoverStack.dom.test 에서 옮겼다
// (중첩은 커서 판 대신 컨트롤 판 안의 유니버스 판처럼 트리거 판 둘로).
//   · 바깥 mousedown(캡처)은 누른 곳을 품은 판과 그 조상만 남긴다 · Esc 는 맨 위 하나만(bubble).
//   · 막 연 판은 한 매크로태스크 뒤에 무장한다 · 탈착(탭 전환)이면 닫힌다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TriggerPopover } from "./TriggerPopover.js";
import { LAYER_ATTR } from "./FloatingSurface.js";
import { MenuItem } from "./menu.js";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const layers = (): HTMLElement[] => [...document.body.querySelectorAll<HTMLElement>(`[${LAYER_ATTR}]`)];
/** 무장 지연(setTimeout 0)·MutationObserver 콜백까지 흘려보낸다. */
const flush = async (): Promise<void> => {
    await act(async () => {
        await new Promise((res) => setTimeout(res, 0));
    });
};

function Nested(): JSX.Element {
    return (
        <div>
            <button data-testid="outside">바깥</button>
            <TriggerPopover trigger={(_, toggle) => <button data-testid="open-parent" onClick={toggle}>판</button>}>
                {() => (
                    <div>
                        <input data-testid="parent-input" />
                        <TriggerPopover trigger={(_, toggle) => <button data-testid="open-child" onClick={toggle}>자식 열기</button>}>
                            {() => <span data-testid="child-body">자식</span>}
                        </TriggerPopover>
                    </div>
                )}
            </TriggerPopover>
        </div>
    );
}

const openBoth = async (): Promise<void> => {
    render(<Nested />);
    fireEvent.click(screen.getByTestId("open-parent"));
    await flush();
    fireEvent.click(screen.getByTestId("open-child"));
    await flush();
    expect(layers()).toHaveLength(2);
};

describe("바깥 클릭 — 누른 곳 위의 판만 닫는다", () => {
    it("자식 판 안을 누르면 둘 다 남는다 — portal 로 DOM 이 떨어져 있어도 자식은 부모의 바깥이 아니다", async () => {
        await openBoth();
        fireEvent.mouseDown(screen.getByTestId("child-body"));
        expect(layers()).toHaveLength(2);
    });

    it("부모 판 안을 누르면 자식만 닫힌다", async () => {
        await openBoth();
        fireEvent.mouseDown(screen.getByTestId("parent-input"));
        expect(layers()).toHaveLength(1);
        expect(screen.queryByTestId("child-body")).toBeNull();
    });

    it("둘 밖을 누르면 전부 닫힌다", async () => {
        await openBoth();
        fireEvent.mouseDown(screen.getByTestId("outside"));
        expect(layers()).toHaveLength(0);
    });

    it("mousedown 을 삼키는 요소 위도 바깥이다 — 캡처로 듣는다", async () => {
        render(
            <div>
                <div data-testid="greedy" onMouseDown={(e) => e.stopPropagation()} />
                <TriggerPopover trigger={(_, toggle) => <button data-testid="t" onClick={toggle}>t</button>}>{() => "판"}</TriggerPopover>
            </div>,
        );
        fireEvent.click(screen.getByTestId("t"));
        await flush();
        fireEvent.mouseDown(screen.getByTestId("greedy"));
        expect(layers()).toHaveLength(0);
    });

    it("연 직후(무장 전)의 mousedown 으로는 안 닫힌다 — 자기를 연 클릭이 자기를 닫지 않게", () => {
        render(<TriggerPopover trigger={(_, toggle) => <button data-testid="t" onClick={toggle}>t</button>}>{() => "판"}</TriggerPopover>);
        fireEvent.click(screen.getByTestId("t"));
        fireEvent.mouseDown(document.body);
        expect(layers()).toHaveLength(1);
    });
});

describe("Esc — 맨 위 하나만", () => {
    it("한 번에 자식 하나, 두 번이면 부모까지", async () => {
        await openBoth();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(layers()).toHaveLength(1);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(layers()).toHaveLength(0);
    });

    it("입력이 Esc 를 먹으면(preventDefault) 판이 안 닫힌다 — bubble 단계라 입력이 먼저 받는다", async () => {
        render(
            <TriggerPopover trigger={(_, toggle) => <button data-testid="t" onClick={toggle}>t</button>}>
                {() => <input data-testid="box" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()} />}
            </TriggerPopover>,
        );
        fireEvent.click(screen.getByTestId("t"));
        await flush();
        fireEvent.keyDown(screen.getByTestId("box"), { key: "Escape" });
        expect(layers()).toHaveLength(1);
    });
});

describe("닫기 직전 blur — 입력 중인 값이 확정된다", () => {
    it("판 안 입력에 포커스가 있을 때 바깥을 누르면 blur 를 거쳐 닫힌다", async () => {
        const onBlur = vi.fn();
        render(
            <div>
                <button data-testid="outside">바깥</button>
                <TriggerPopover trigger={(_, toggle) => <button data-testid="t" onClick={toggle}>t</button>}>
                    {() => <input data-testid="num" onBlur={onBlur} />}
                </TriggerPopover>
            </div>,
        );
        fireEvent.click(screen.getByTestId("t"));
        await flush();
        (screen.getByTestId("num") as HTMLInputElement).focus();
        fireEvent.mouseDown(screen.getByTestId("outside"));
        expect(onBlur).toHaveBeenCalled();
        expect(layers()).toHaveLength(0);
    });
});

describe("TriggerPopover", () => {
    const draw = (): ReturnType<typeof render> =>
        render(
            <div>
                <button data-testid="outside">바깥</button>
                <TriggerPopover width={200} trigger={(open, toggle) => <button data-testid="trigger" onClick={toggle}>{open ? "열림" : "닫힘"}</button>}>
                    {(close) => <MenuItem onClick={close}>고르기</MenuItem>}
                </TriggerPopover>
            </div>,
        );

    it("트리거 재클릭은 토글 한 번 — 바깥으로 세면 닫혔다 곧바로 다시 열린다", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        await flush();
        const t = r.getByTestId("trigger");
        fireEvent.mouseDown(t);
        fireEvent.click(t);
        expect(layers()).toHaveLength(0);
        expect(t.textContent).toBe("닫힘");
    });

    it("내용의 close 로 닫힌다(메뉴에서 고르기)", () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        fireEvent.click(screen.getByRole("menuitem"));
        expect(layers()).toHaveLength(0);
    });

    it("앵커 탈착(dockview 탭 전환) 후 닫힌다 — body 에 남은 판이 다른 패널 위에 겹치던 버그", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        expect(layers()).toHaveLength(1);
        r.container.remove(); // dockview 처럼 앵커 쪽 DOM 만 뗀다 — React 는 unmount 를 모른다
        await flush();
        expect(layers()).toHaveLength(0);
    });

    it("앵커가 붙어 있는 동안의 다른 DOM 변화로는 안 닫힌다", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        const noise = document.createElement("div");
        document.body.appendChild(noise);
        noise.remove();
        await flush();
        expect(layers()).toHaveLength(1);
    });
});

describe("MenuItem", () => {
    it("라디오 표식 칸은 꺼져 있어도 자리를 지키고, 고른 줄은 배경을 인라인이 아니라 data 속성으로(CSS 가 칠해야 :hover 가 산다)", () => {
        render(
            <>
                <MenuItem mark="radio" on selected onClick={() => {}}>가</MenuItem>
                <MenuItem mark="radio" onClick={() => {}}>나</MenuItem>
            </>,
        );
        const [a, b] = screen.getAllByRole("menuitem");
        expect([a!, b!].map((el) => el.querySelector("[aria-hidden]")?.textContent)).toEqual(["●", "○"]);
        expect(a!.hasAttribute("data-selected")).toBe(true);
        expect(a!.style.background).toBe("");
    });
});
