// 자람 규약 — 방향은 처음 한 번, 이후 판이 자라도 자리는 그대로 두고 maxHeight(내부 스크롤)만.
// setup 의 ResizeObserver 스텁은 observe 즉시 한 번만 쏘므로, 여기선 손으로 쏘는 RO 로 갈아 끼운다.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { AnchoredPopover } from "../AnchoredPopover.js";
import { LAYER_ATTR } from "../FloatingSurface.js";

let fire: (() => void) | null = null;
const OrigRO = window.ResizeObserver;
const origRect = Element.prototype.getBoundingClientRect;
let height = 300;

beforeEach(() => {
    class ManualRO {
        constructor(private readonly cb: () => void) {}
        observe(): void { fire = () => this.cb(); }
        unobserve(): void {}
        disconnect(): void { fire = null; }
    }
    window.ResizeObserver = ManualRO as unknown as typeof ResizeObserver;
    Element.prototype.getBoundingClientRect = function (): DOMRect {
        return { x: 0, y: 0, top: 0, left: 0, width: 200, height, right: 200, bottom: height, toJSON: () => ({}) } as DOMRect;
    };
});
afterEach(() => {
    cleanup();
    window.ResizeObserver = OrigRO;
    Element.prototype.getBoundingClientRect = origRect;
    height = 300;
    vi.restoreAllMocks();
});

const surface = (): HTMLElement => document.body.querySelector<HTMLElement>(`[${LAYER_ATTR}]`)!;

describe("판이 자라도 안 튄다", () => {
    it("아래로 연 판이 남은 공간보다 커져도 자리(transform)는 그대로, maxHeight 만 걸린다", () => {
        // jsdom 뷰포트 1024×768. 커서 y=400 → 아래 360(=768−8−400), 판 300 이면 아래에 들어간다.
        render(<AnchoredPopover anchor={{ x: 100, y: 400 }} onClose={() => {}} maxHeight={5000}>판</AnchoredPopover>);
        const before = surface().style.transform;
        expect(surface().style.top).toBe("0px");
        height = 700; // 편집기에 줄이 늘었다 — 처음부터 다시 고르면 위로 뒤집혔을 크기
        act(() => fire?.());
        expect(surface().style.transform).toBe(before);
        expect(surface().style.top).toBe("0px"); // 여전히 윗변 고정(아래로 연 판)
        expect(surface().style.maxHeight).toBe("360px"); // 숫자 cap 5000 과 남은 360 중 작은 쪽
    });

    it("아래가 모자라면 처음부터 위로 — 아랫변 고정이라 위로 자란다", () => {
        render(<AnchoredPopover anchor={{ x: 100, y: 700 }} onClose={() => {}} maxHeight={5000}>판</AnchoredPopover>);
        expect(surface().style.bottom).toBe("0px");
        expect(surface().style.top).toBe("");
    });

    it("재기 전에는 안 보인다 — (0,0) 에서 한 번 깜빡이지 않게", () => {
        // 첫 layoutEffect 가 같은 커밋 안에서 자리를 잡으므로, 렌더가 끝난 뒤엔 보인다.
        render(<AnchoredPopover anchor={{ x: 100, y: 100 }} onClose={() => {}}>판</AnchoredPopover>);
        expect(surface().style.opacity).toBe(""); // 잴 동안만 opacity 0(visibility:hidden 은 autoFocus 를 죽인다)
    });
});
