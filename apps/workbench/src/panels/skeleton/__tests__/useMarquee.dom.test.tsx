// Ctrl+드래그 사각 선택 — **사각형 역학**과 그 배선.
//
// `keysInRect`(무엇이 담기나)는 순수 함수라 이미 덮여 있었고, 정작 그 앞의 역학이 안 덮여 있었다:
// 언제 시작하나 · 클릭을 드래그로 오인하지 않나 · 리스너가 안 새나 · 뗄 때 **어느 시점의** 판정 재료를
// 쓰나. 마지막 것이 특히 미묘하다 — 드래그 중에 화면이 바뀌면(리사이즈·필터) 라벨이 움직이는데,
// 시작 시점 스냅숏으로 판정하면 **보이는 것과 담기는 게 어긋난다**. 그래서 ref 로 최신 콜백을 부른다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, fireEvent } from "@testing-library/react";
import { createRef, type MouseEvent as ReactMouseEvent } from "react";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { useMarquee, type MarqueeRect } from "../useMarquee.js";
import { CLUSTER_CODES, DATE, clusterFeed, clusterPoints } from "./overlayFixture.js";

/** React 합성 이벤트 자리 — 훅이 읽는 건 이 네 가지뿐이다. */
const down = (x: number, y: number, mod: { ctrlKey?: boolean; metaKey?: boolean } = { ctrlKey: true }): ReactMouseEvent =>
    ({ ctrlKey: false, metaKey: false, ...mod, clientX: x, clientY: y, preventDefault: () => {} }) as unknown as ReactMouseEvent;

const drag = (to: { x: number; y: number }): void => {
    act(() => { window.dispatchEvent(new MouseEvent("mousemove", { clientX: to.x, clientY: to.y })); });
};
const release = (): void => {
    act(() => { window.dispatchEvent(new MouseEvent("mouseup")); });
};

// wrapRef 대신 실제 div — setup 이 getBoundingClientRect 를 (0,0) 기준으로 물리므로 client 좌표가 곧 상대 좌표다.
const setup = (onSelect: (r: MarqueeRect) => void = vi.fn(), enabled = true) => {
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement | null }).current = document.createElement("div");
    return { ref, ...renderHook(({ cb }: { cb: (r: MarqueeRect) => void }) => useMarquee(ref, enabled, cb), { initialProps: { cb: onSelect } }) };
};

describe("시작 조건 — Ctrl(또는 Cmd) 이 있어야 마퀴다", () => {
    // d3-zoom 의 기본 filter 가 ctrl+mousedown 을 무시하므로 이 이벤트는 마퀴 몫이다(패널 규약).
    it("맨 드래그는 마퀴가 아니다 — 그건 이동(팬)이다", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(10, 10, {})));
        expect(result.current.marquee).toBeNull();
    });

    it("Ctrl 이면 사각형이 선다", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(10, 20)));
        expect(result.current.marquee).toEqual({ x0: 10, y0: 20, x1: 10, y1: 20 });
    });

    it("Cmd(메타)도 같다 — 맥에서도 같은 손짓", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(10, 20, { metaKey: true })));
        expect(result.current.marquee).not.toBeNull();
    });

    it("꺼져 있으면(척도 없음) 시작 안 한다 — 판정할 좌표계가 없다", () => {
        const { result } = setup(vi.fn(), false);
        act(() => result.current.onMouseDown(down(10, 20)));
        expect(result.current.marquee).toBeNull();
    });
});

describe("사각형 — 끌면 자라고 떼면 사라진다", () => {
    it("이동하면 반대편 모서리가 따라온다", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(10, 20)));
        drag({ x: 100, y: 200 });
        expect(result.current.marquee).toEqual({ x0: 10, y0: 20, x1: 100, y1: 200 });
    });

    it("떼면 사각형이 사라진다 — 화면에 남으면 다음 손짓을 가린다", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(10, 20)));
        drag({ x: 100, y: 200 });
        release();
        expect(result.current.marquee).toBeNull();
    });

    it("역방향(오른→왼)도 성립한다 — 정규화는 그리는 쪽의 몫", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(300, 300)));
        drag({ x: 100, y: 100 });
        expect(result.current.marquee).toMatchObject({ x0: 300, y0: 300, x1: 100, y1: 100 });
    });
});

describe("클릭 오인 방지 — 조금 흔들린 클릭은 선택이 아니다", () => {
    it("두 변 다 임계 미만이면 안 담는다", () => {
        const onSelect = vi.fn();
        const { result } = setup(onSelect);
        act(() => result.current.onMouseDown(down(10, 10)));
        drag({ x: 12, y: 12 }); // 2px
        release();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("한 변만 넘어도 담는다 — 가로로 길게 훑는 손짓이 성립한다", () => {
        const onSelect = vi.fn();
        const { result } = setup(onSelect);
        act(() => result.current.onMouseDown(down(10, 10)));
        drag({ x: 200, y: 11 });
        release();
        expect(onSelect).toHaveBeenCalledWith({ x0: 10, y0: 10, x1: 200, y1: 11 });
    });

    it("아예 안 움직이고 떼면 안 담는다", () => {
        const onSelect = vi.fn();
        const { result } = setup(onSelect);
        act(() => result.current.onMouseDown(down(10, 10)));
        release();
        expect(onSelect).not.toHaveBeenCalled();
    });
});

// ⚠ 이 둘이 이 파일의 존재 이유다 — 눈으로는 "가끔 이상하다"로만 보이는 종류다.
describe("판정 시점 — 뗄 때의 **최신** 재료로 담는다", () => {
    it("드래그 중에 판정이 바뀌면 새 것이 불린다 — 보이는 것과 담기는 게 어긋나지 않게", () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = setup(first);
        act(() => result.current.onMouseDown(down(10, 10)));
        drag({ x: 200, y: 200 });

        rerender({ cb: second }); // 리사이즈·필터로 라벨 자리가 바뀐 상황
        release();

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });
});

describe("리스너 수명 — 드래그 도중 패널이 닫혀도 안 남는다", () => {
    it("언마운트되면 이후 mouseup 이 콜백을 안 부른다", () => {
        const onSelect = vi.fn();
        const { result, unmount } = setup(onSelect);
        act(() => result.current.onMouseDown(down(10, 10)));
        drag({ x: 200, y: 200 });

        unmount(); // 도킹 패널 닫기
        release();

        expect(onSelect).not.toHaveBeenCalled();
    });

    it("한 번 뗀 뒤의 이동은 사각형을 안 되살린다", () => {
        const { result } = setup();
        act(() => result.current.onMouseDown(down(10, 10)));
        drag({ x: 200, y: 200 });
        release();
        drag({ x: 400, y: 400 });
        expect(result.current.marquee).toBeNull();
    });
});

// ── 배선 — 훅이 낸 사각형이 실제로 선택으로 이어지나 ────────────────────────
describe("패널에 배선된 채로 — 훑으면 그 라벨들이 담긴다", () => {
    beforeEach(() => { useWorkbench.setState({ activePoint: null, skeletonSelection: new Set() }); });
    afterEach(() => { useWorkbench.setState({ activePoint: null, skeletonSelection: new Set() }); localStorage.clear(); });

    /** 뭉친 세 골격의 라벨 지점을 넉넉히 덮는 사각형(척도 계산은 패널이 한다). */
    const sweep = (el: HTMLElement): void => {
        fireEvent.mouseDown(el, { ctrlKey: true, clientX: 700, clientY: 250 });
        drag({ x: 900, y: 420 });
        release();
    };

    it("사각형 안의 골격들이 선택된다 — 무리를 만드는 손짓", () => {
        const { container } = renderWithProviders(<SkeletonOverlayPanel grain="daily" />, { skeletons: clusterFeed, points: clusterPoints });
        sweep(container.querySelector<HTMLElement>("[data-plot]")!);
        const picked = useWorkbench.getState().skeletonSelection;
        expect([...picked].sort()).toEqual(CLUSTER_CODES.map((c) => `${c}|${DATE}`).sort());
    });

    it("빈 자리를 훑으면 아무것도 안 담는다 — 선택을 지우지도 않는다", () => {
        const { container } = renderWithProviders(<SkeletonOverlayPanel grain="daily" />, { skeletons: clusterFeed, points: clusterPoints });
        act(() => { useWorkbench.setState({ skeletonSelection: new Set([`${CLUSTER_CODES[0]}|${DATE}`]) }); });
        const el = container.querySelector<HTMLElement>("[data-plot]")!;
        fireEvent.mouseDown(el, { ctrlKey: true, clientX: 60, clientY: 30 });
        drag({ x: 160, y: 90 });
        release();
        expect(useWorkbench.getState().skeletonSelection.size).toBe(1); // 그대로
    });

    // 합집합(누적)이라 여러 번 훑어 무리를 키울 수 있다.
    it("이미 고른 것에 **더한다** — 훑을 때마다 갈아치우면 무리를 못 키운다", () => {
        const { container } = renderWithProviders(<SkeletonOverlayPanel grain="daily" />, { skeletons: clusterFeed, points: clusterPoints });
        act(() => { useWorkbench.setState({ skeletonSelection: new Set(["미리|고른것"]) }); });
        sweep(container.querySelector<HTMLElement>("[data-plot]")!);
        expect(useWorkbench.getState().skeletonSelection.has("미리|고른것")).toBe(true);
        expect(useWorkbench.getState().skeletonSelection.size).toBe(4);
    });
});
