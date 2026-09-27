// 스택 규약 — 떠 있는 판들의 닫힘을 한 곳이 판정한다(stack.ts 머리 주석).
//   · 바깥 mousedown(캡처)은 누른 곳을 품은 판과 그 조상만 남긴다 · Esc 는 맨 위 하나만(bubble).
//   · 막 연 판은 한 매크로태스크 뒤에 무장한다 · 탈착(탭 전환)이면 닫힌다.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { AnchoredPopover } from "../AnchoredPopover.js";
import { TriggerPopover } from "../TriggerPopover.js";
import { LAYER_ATTR } from "../FloatingSurface.js";

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

/** 부모 판 안에 자식 판을 여는 버튼이 있는 중첩 — 편집기 안의 ＋ 조건 판, 필터 판 안의 처리 배지 판의 모양. */
function Nested({ onParentClose, onChildClose }: { onParentClose?: () => void; onChildClose?: () => void }): JSX.Element {
    const [parent, setParent] = useState(true);
    const [child, setChild] = useState(false);
    return (
        <div>
            <button data-testid="outside">바깥</button>
            {parent && (
                <AnchoredPopover anchor={{ x: 10, y: 10 }} onClose={() => { onParentClose?.(); setParent(false); }}>
                    <button data-testid="open-child" onClick={() => setChild(true)}>자식 열기</button>
                    <input data-testid="parent-input" />
                    {child && (
                        <AnchoredPopover anchor={{ x: 50, y: 50 }} onClose={() => { onChildClose?.(); setChild(false); }}>
                            <span data-testid="child-body">자식</span>
                        </AnchoredPopover>
                    )}
                </AnchoredPopover>
            )}
        </div>
    );
}

const openBoth = async (): Promise<void> => {
    render(<Nested />);
    await flush();
    fireEvent.click(document.querySelector("[data-testid='open-child']")!);
    await flush();
    expect(layers().length).toBe(2);
};

describe("바깥 클릭 — 누른 곳 위의 판만 닫는다", () => {
    it("자식 판 안을 누르면 둘 다 남는다 — 자식은 부모의 바깥이 아니다(portal 로 DOM 이 떨어져 있어도)", async () => {
        await openBoth();
        fireEvent.mouseDown(document.querySelector("[data-testid='child-body']")!);
        expect(layers().length).toBe(2);
    });

    it("부모 판 안을 누르면 자식만 닫힌다", async () => {
        await openBoth();
        fireEvent.mouseDown(document.querySelector("[data-testid='parent-input']")!);
        expect(layers().length).toBe(1);
        expect(document.querySelector("[data-testid='child-body']")).toBeNull();
    });

    it("둘 밖을 누르면 전부 닫힌다", async () => {
        await openBoth();
        fireEvent.mouseDown(document.querySelector("[data-testid='outside']")!);
        expect(layers().length).toBe(0);
    });

    it("mousedown 을 삼키는 요소 위도 바깥이다 — 캡처로 듣는다(d3·보드 행)", async () => {
        const onClose = vi.fn();
        const { getByTestId } = render(
            <div>
                <div data-testid="greedy" onMouseDown={(e) => e.stopPropagation()} />
                <AnchoredPopover anchor={{ x: 0, y: 0 }} onClose={onClose}>판</AnchoredPopover>
            </div>,
        );
        await flush();
        fireEvent.mouseDown(getByTestId("greedy"));
        expect(onClose).toHaveBeenCalled();
    });

    it("연 직후(무장 전)의 mousedown 으로는 안 닫힌다 — 자기를 연 클릭이 자기를 닫지 않게", () => {
        const onClose = vi.fn();
        render(<AnchoredPopover anchor={{ x: 0, y: 0 }} onClose={onClose}>판</AnchoredPopover>);
        fireEvent.mouseDown(document.body);
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("Esc — 맨 위 하나만", () => {
    it("한 번에 자식 하나, 두 번이면 부모까지", async () => {
        await openBoth();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(layers().length).toBe(1);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(layers().length).toBe(0);
    });

    it("입력이 Esc 를 먹으면(preventDefault) 판이 안 닫힌다 — bubble 단계라 입력이 먼저 받는다", async () => {
        const onClose = vi.fn();
        render(
            <AnchoredPopover anchor={{ x: 0, y: 0 }} onClose={onClose}>
                <input data-testid="rename" onKeyDown={(e) => { if (e.key === "Escape") e.preventDefault(); }} />
            </AnchoredPopover>,
        );
        await flush();
        fireEvent.keyDown(document.querySelector("[data-testid='rename']")!, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("입력이 전파를 끊어도(stopPropagation) 판이 안 닫힌다", async () => {
        const onClose = vi.fn();
        render(
            <AnchoredPopover anchor={{ x: 0, y: 0 }} onClose={onClose}>
                <input data-testid="rename" onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }} />
            </AnchoredPopover>,
        );
        await flush();
        fireEvent.keyDown(document.querySelector("[data-testid='rename']")!, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("닫기 직전 blur — 입력 중인 값이 커밋된다", () => {
    it("판 안 입력에 포커스가 있을 때 바깥을 누르면 blur 가 먼저 온다", async () => {
        const order: string[] = [];
        render(
            <div>
                <button data-testid="outside">바깥</button>
                <AnchoredPopover anchor={{ x: 0, y: 0 }} onClose={() => order.push("close")}>
                    <input data-testid="num" onBlur={() => order.push("blur")} />
                </AnchoredPopover>
            </div>,
        );
        await flush();
        (document.querySelector("[data-testid='num']") as HTMLInputElement).focus();
        fireEvent.mouseDown(document.querySelector("[data-testid='outside']")!);
        expect(order).toEqual(["blur", "close"]);
    });
});

describe("TriggerPopover", () => {
    const draw = (): ReturnType<typeof render> =>
        render(
            <div>
                <button data-testid="outside">바깥</button>
                <TriggerPopover width={200} trigger={(open, toggle) => <button data-testid="trigger" onClick={toggle}>{open ? "열림" : "닫힘"}</button>}>
                    {() => <div data-testid="body">판 내용</div>}
                </TriggerPopover>
            </div>,
        );

    it("기본이 바깥 클릭 닫힘 — 예외 없음(2026-09-27)", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        await flush();
        fireEvent.mouseDown(r.getByTestId("outside"));
        expect(layers().length).toBe(0);
    });

    it("트리거 재클릭은 토글 한 번 — 바깥으로 세면 닫혔다 곧바로 다시 열린다", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        await flush();
        const t = r.getByTestId("trigger");
        fireEvent.mouseDown(t);
        fireEvent.click(t);
        expect(layers().length).toBe(0);
        expect(t.textContent).toBe("닫힘");
    });

    it("앵커 탈착(탭 전환) 후 닫힌다 — portal 잔류가 그 버그였다", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        expect(layers().length).toBe(1);
        r.container.remove(); // dockview 처럼 앵커 쪽 DOM 만 뗀다 — React 는 unmount 를 모른다
        await flush();
        expect(layers().length).toBe(0);
    });

    it("앵커가 붙어 있는 동안의 다른 DOM 변화로는 안 닫힌다", async () => {
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        const noise = document.createElement("div");
        document.body.appendChild(noise);
        noise.remove();
        await flush();
        expect(layers().length).toBe(1);
    });

    it("닫으면 관찰도 끊는다 — 열고 닫기를 반복해도 죽은 구독이 안 쌓인다", async () => {
        const spy = vi.spyOn(MutationObserver.prototype, "disconnect");
        const r = draw();
        fireEvent.click(r.getByTestId("trigger"));
        const before = spy.mock.calls.length;
        fireEvent.keyDown(document, { key: "Escape" });
        expect(layers().length).toBe(0);
        expect(spy.mock.calls.length).toBeGreaterThan(before);
    });
});

describe("AnchoredPopover — 점 앵커도 탈착이면 닫힌다(센티널)", () => {
    it("연 자리(패널)가 DOM 에서 떨어지면 onClose", async () => {
        const onClose = vi.fn();
        const r = render(<div><AnchoredPopover anchor={{ x: 0, y: 0 }} onClose={onClose}>판</AnchoredPopover></div>);
        r.container.remove();
        await flush();
        expect(onClose).toHaveBeenCalled();
    });
});
