// HeaderPopover 의 **잔류 방지 규약** — dockview 탭 전환은 비활성 패널의 element 를 DOM 에서
// 떼어낸다(React 트리는 유지). 그때 portal 된 팝오버가 화면에 남으면 다른 패널 위에 겹친다
// (2026-09-17 테마 순위 실측: 관찰판 "축 ▾" 판이 조건판 위에 잔류). 감지는 MutationObserver
// (body subtree childList) → 앵커 isConnected 재확인 → 닫기. jsdom 이 MO 를 구현하므로
// 가짜 스텁 없이 진짜 탈착으로 검증한다(IntersectionObserver 였다면 스텁이 필요했다 —
// 그리고 그 스텁이 "Chrome 은 제거 시 통지를 안 쏜다"는 진실을 가렸을 것이다).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, act, type RenderResult } from "@testing-library/react";
import { HeaderPopover } from "../HeaderPopover.js";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks(); // 프로토타입 spy 가 단언 실패 시 다음 테스트로 새지 않게
});

const draw = (): RenderResult =>
    render(
        <HeaderPopover width={200} trigger={(_open, toggle) => <button onClick={toggle}>축 ▾</button>}>
            {() => <div>판 내용</div>}
        </HeaderPopover>,
    );

const openIt = (r: RenderResult): void => {
    fireEvent.click(r.container.querySelector("button")!);
};
const popover = (): Element | null => document.body.querySelector("[data-header-popover]");
/** MutationObserver 콜백(마이크로태스크)까지 흘려보낸다 — act 없이는 setOpen 이 경고만 내고 증발한다. */
const flush = async (): Promise<void> => {
    await act(async () => {
        await new Promise((res) => setTimeout(res, 0));
    });
};

describe("잔류 방지 — 앵커가 DOM 에서 떨어지면 닫는다", () => {
    it("앵커 탈착(탭 전환) 후 닫힌다 — portal 잔류가 그 버그였다", async () => {
        const r = draw();
        openIt(r);
        expect(popover()).toBeTruthy();
        // dockview 처럼 앵커 쪽 DOM 만 떼어낸다 — React 는 unmount 를 모른다(그래서 잔류했다).
        r.container.remove();
        await flush();
        expect(popover()).toBeNull();
    });

    it("앵커가 붙어 있는 동안의 다른 DOM 변화로는 **안** 닫힌다 — 열어 둔 채 뒤를 만지는 워크플로가 본론이다", async () => {
        const r = draw();
        openIt(r);
        // 뒤의 보드가 갱신되는 상황 — body 에 무관한 노드가 들락거린다.
        const noise = document.createElement("div");
        document.body.appendChild(noise);
        noise.remove();
        await flush();
        expect(popover()).toBeTruthy();
    });

    it("닫으면 관찰도 끊는다 — 열고 닫기를 반복해도 죽은 구독이 안 쌓인다", () => {
        const spy = vi.spyOn(MutationObserver.prototype, "disconnect");
        const r = draw();
        openIt(r);
        const before = spy.mock.calls.length;
        fireEvent.keyDown(document, { key: "Escape" });
        expect(popover()).toBeNull();
        expect(spy.mock.calls.length).toBeGreaterThan(before);
    });

    it("닫았다 다시 열어도 탈착을 듣는다 — effect 가 재구독하는지", async () => {
        const r = draw();
        openIt(r);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(popover()).toBeNull();
        openIt(r);
        expect(popover()).toBeTruthy();
        r.container.remove();
        await flush();
        expect(popover()).toBeNull();
    });
});
