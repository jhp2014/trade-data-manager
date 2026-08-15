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

    /**
     * 캔버스 2D 컨텍스트 — jsdom 에 없다. 그냥 두면 부를 때마다 "Not implemented" 를 콘솔에 쏟아 내
     * 진짜 경고가 묻힌다. 페인터는 컨텍스트가 없으면 **조용히 그리기를 건너뛴다**(표시목록은 그대로
     * 남는다) — 그림을 보는 검사는 DOM 이 아니라 그 목록을 읽으므로(drawProbe) 여기선 소음만 없앤다.
     */
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];

    // scrollIntoView·PointerCapture — 되짚기·드래그 코드가 부르는데 jsdom 에 없다(호출만 삼킨다).
    Element.prototype.scrollIntoView = function (): void {};
    Element.prototype.setPointerCapture = function (): void {};
    Element.prototype.releasePointerCapture = function (): void {};

    /**
     * DOMMatrixReadOnly — jsdom 에 없다. React Flow 가 CSS transform 문자열에서 zoom 을 읽는 데 쓴다
     * (`new DOMMatrixReadOnly(el.style.transform).m22`). 테스트에서는 변환이 없으니 **항등행렬**이면
     * 충분하다 — 파싱까지 흉내 내면 그 흉내가 또 하나의 검증 대상이 된다.
     */
    if (typeof window.DOMMatrixReadOnly === "undefined") {
        class TestDOMMatrixReadOnly {
            m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
            a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        }
        window.DOMMatrixReadOnly = TestDOMMatrixReadOnly as unknown as typeof DOMMatrixReadOnly;
    }

    /**
     * 네트워크 그물 — 화면 테스트는 **캐시에 심은 것만** 먹고 살아야 한다(renderPanel 머리 주석).
     *
     * 왜 그냥 막는 걸로는 부족한가: 쿼리를 안 심으면 react-query 가 그대로 서버를 부르는데, 실패해도
     * **react-query 가 에러를 삼킨다**. 그러면 그 화면은 조용히 빈 채로 남고 테스트는 통과한다 —
     * 이 파일들이 내내 경계하는 "빈 화면을 상대로 헛돈다"가 하네스 층에서 그대로 재현되는 셈이다.
     * 그래서 막기만 하지 않고 **불렀다는 사실을 기록해 그 테스트를 실패시킨다**.
     *
     * 일부러 네트워크를 흉내 내야 하는 테스트는 제 손으로 `fetch` 를 갈아 끼우면 된다 — 기록기가
     * 통째로 교체되므로 이 그물에 안 걸린다(그게 명시적인 탈출구다).
     */
    const networkCalls: string[] = [];
    window.fetch = ((input: unknown): Promise<Response> => {
        networkCalls.push(typeof input === "string" ? input : String((input as { url?: string })?.url ?? input));
        return Promise.reject(new Error("테스트에서 네트워크 금지 — 쿼리를 seed 로 심어라"));
    }) as typeof fetch;

    afterEach(async () => {
        const { cleanup } = await import("@testing-library/react");
        cleanup();
        const calls = networkCalls.splice(0);
        if (calls.length > 0) {
            throw new Error(
                `테스트가 네트워크를 쳤다(${calls.length}건) — 그 화면은 데이터 없이 그려졌으므로 단언이 헛돈다.\n` +
                `  ${[...new Set(calls)].join("\n  ")}\n` +
                `renderWithProviders 의 seed 에 해당 쿼리를 심어라.`,
            );
        }
    });
}
