// 테스트 환경 보정 — jsdom 에 없는 브라우저 API 를 최소한으로 채운다.
//
// 순수 함수 테스트에도 이 파일이 로드되지만(setupFiles 는 전역), 아래 보정은 전부 `window` 가 있을 때만
// 걸리므로 node 환경에서는 아무 일도 하지 않는다.
import { afterEach } from "vitest";
// ⚠ configure 는 **@testing-library/react 가 재수출하는 것**을 쓴다 — dom 패키지를 직접 부르면
// pnpm 이 사본을 따로 물고 있을 때 설정이 다른 인스턴스에 걸려 조용히 아무 일도 안 한다.
import { configure } from "@testing-library/react";

if (typeof window !== "undefined") {
    /**
     * 글자 찾기는 `aria-hidden` 을 건너뛴다.
     *
     * 머리글 컨트롤의 폭 잠금(HeaderControls.WidthLock)이 **있을 수 있는 모든 모습을 겹쳐 쌓아** 칸을
     * 잡는다 — 즉 라벨이 화면에 하나, 숨은 사본으로 하나 더 있다. 기본 설정이면 `getByText("목록")` 이
     * 둘을 집어 "여러 개 찾음"으로 터진다(실제로 맵 테스트가 그렇게 깨졌다).
     *
     * 사본에는 전부 `aria-hidden` 이 붙어 있고, 그건 정의상 **읽는 이에게 없는 것**이다. 테스트가
     * 읽는 이와 같은 것을 보게 맞추는 게 옳지, 테스트마다 getAllByText 로 우회할 일이 아니다.
     *
     * ⚠ `[aria-hidden='true'] *` 도 같이 뺀다 — ignore 는 **매치된 그 노드**만 보므로, 사본 안쪽
     * 엘리먼트(굵은 사본의 `<b>`)는 조상이 숨겨져 있어도 그대로 잡힌다. 실제로 그렇게 새어 나왔다.
     */
    configure({ defaultIgnore: "script, style, [aria-hidden='true'], [aria-hidden='true'] *" });

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
