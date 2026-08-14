// 테스트 환경 보정 — jsdom 에 없는 브라우저 API 를 최소한으로 채운다.
//
// 순수 함수 테스트에도 이 파일이 로드되지만(setupFiles 는 전역), 아래 보정은 전부 `window` 가 있을 때만
// 걸리므로 node 환경에서는 아무 일도 하지 않는다.
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
    /**
     * ResizeObserver — jsdom 에 없다. 그냥 없는 채로 두면 그림 패널이 **아무것도 안 그린다**:
     * 크기를 못 재면 상자 폭이 0이고, 폭이 0이면 스케일을 만들 수 없어 SVG 안이 통째로 비어 있다.
     * 그래서 관측을 시작하는 즉시 **고정 크기를 한 번 통보**한다 — 실제 브라우저에서 첫 관측이
     * 곧바로 콜백을 부르는 것과 같은 순서다.
     */
    const SIZE = { width: 1000, height: 600 };
    class TestResizeObserver implements ResizeObserver {
        constructor(private readonly cb: ResizeObserverCallback) {}
        observe(target: Element): void {
            const entry = { target, contentRect: { ...SIZE, top: 0, left: 0, bottom: SIZE.height, right: SIZE.width, x: 0, y: 0 } };
            this.cb([entry as unknown as ResizeObserverEntry], this);
        }
        unobserve(): void {}
        disconnect(): void {}
    }
    window.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

    /**
     * getBoundingClientRect — jsdom 은 레이아웃을 안 하므로 전부 0을 준다. 0 이면 포인터 좌표를
     * 프랙션으로 바꾸는 계산이 전부 0/0 이 되어, **자리 판정이 있는 테스트가 조용히 참이 된다**.
     * 그림 상자와 같은 크기를 돌려줘 좌표 계산이 실제와 같은 척도에서 돌게 한다.
     */
    Element.prototype.getBoundingClientRect = function (): DOMRect {
        return { x: 0, y: 0, top: 0, left: 0, width: SIZE.width, height: SIZE.height, bottom: SIZE.height, right: SIZE.width, toJSON: () => ({}) } as DOMRect;
    };

    // scrollIntoView·PointerCapture — 되짚기·드래그 코드가 부르는데 jsdom 에 없다(호출만 삼킨다).
    Element.prototype.scrollIntoView = function (): void {};
    Element.prototype.setPointerCapture = function (): void {};
    Element.prototype.releasePointerCapture = function (): void {};

    afterEach(async () => {
        const { cleanup } = await import("@testing-library/react");
        cleanup();
    });
}
