// 토큰 기록 판 — 줄이 뜻으로 보이고, 열린 동안 w/s·Space 가 판의 것이며, 다시 열기가 원래 선으로 되돌리는지.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import { usePaths } from "../store/paths.js";
import { useTokenHistory } from "../store/tokenHistory.js";
import { useUi } from "../store/ui.js";
import { TokenHistoryButton } from "./TokenHistory.js";
import { pasteState } from "./usePasteState.js";

const T1 = "402340@2026-07-31@260701H▲@260715H▼";
const T2 = "402340@2026-07-31@260701H▲@260715H▲";
const T3 = "009150@2026-07-30";

const press = (key: string, target: EventTarget = window) =>
    act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const selected = () => document.querySelector("[data-token][data-selected]")?.getAttribute("data-token");
const active = () => usePaths.getState().paths[0].s;

function renderButton() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({ stockMaster: async () => [{ stockCode: "402340", name: "SK스퀘어", market: "거래소" }] });
    render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <TokenHistoryButton />
                <input aria-label="칸" />
            </MarketProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    useTokenHistory.setState({ entries: [] });
    useUi.setState({ tokenHistoryOpen: false });
});
afterEach(cleanup);

describe("토큰 기록 판", () => {
    it("줄 = 종목 이름·코드·날짜 + 선 날짜(먼 것부터 — 구간은 안 보인다)", async () => {
        pasteState(`${T1} ${T3}`);
        renderButton();
        // 실제 브라우저는 누른 버튼에 포커스를 준다 — jsdom 의 click 은 안 주므로 먼저 준다
        const button = screen.getByRole("button", { name: "토큰 기록" });
        act(() => button.focus());
        expect(document.activeElement).toBe(button);
        fireEvent.click(button);
        expect(await screen.findByText("SK스퀘어")).toBeTruthy();
        expect(screen.getByText("26/07/01")).toBeTruthy(); // 선 칸 — 거래일 달력이 없으면 거래일 수는 빠진다
        expect(screen.getByText("26/07/15")).toBeTruthy();
        expect(screen.getByText("선 없음")).toBeTruthy();
        expect(selected()).toBe(T1); // 열리면 맨 위
        expect(document.activeElement?.tagName).not.toBe("BUTTON"); // 연 버튼의 포커스를 놓는다 — Space 가 버튼을 다시 누르지 않게
    });
    it("w/s 로 고르고 Space 로 다시 연다 — 선을 바꾼 뒤에도 원래 선으로, 순서는 그대로", () => {
        pasteState(`${T1} ${T2} ${T3}`);
        renderButton();
        act(() => useUi.getState().toggleTokenHistory());
        press("s");
        expect(selected()).toBe(T2);
        press(" ");
        expect(active()).toMatchObject({ zone: 2 });
        usePaths.getState().write("A", { lines: [] }); // 선을 바꿔 본 뒤
        press("w");
        press("w"); // 맨 위에서 멈춘다
        press(" ");
        expect(active()).toMatchObject({ lines: [{ date: "2026-07-01" }, { date: "2026-07-15" }], zone: 1 });
        expect(useTokenHistory.getState().entries.map((e) => e.token)).toEqual([T1, T2, T3]);
    });
    it("입력칸 포커스면 w/s·Space 를 가로채지 않는다 · 닫히면 키를 놓는다", () => {
        pasteState(`${T1} ${T2}`);
        renderButton();
        act(() => useUi.getState().toggleTokenHistory());
        const input = screen.getByRole("textbox", { name: "칸" });
        press("s", input);
        expect(selected()).toBe(T1);
        act(() => useUi.getState().closeTokenHistory());
        const ev = new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true });
        act(() => void window.dispatchEvent(ev));
        expect(ev.defaultPrevented).toBe(false);
    });
    it("고른 줄은 토큰으로 쥔다 — 위 줄을 지워도 그대로, 다시 붙여넣으면(첫 토큰이 같아도) 맨 위로", () => {
        pasteState(`${T1} ${T2} ${T3}`);
        renderButton();
        act(() => useUi.getState().toggleTokenHistory());
        press("s");
        press("s");
        expect(selected()).toBe(T3);
        act(() => useTokenHistory.getState().remove(T1));
        expect(selected()).toBe(T3);
        act(() => void pasteState(T2));
        expect(selected()).toBe(T2);
    });
    it("판을 열면 커서는 지금 열린 토큰(●)에서 — 없으면 맨 위", () => {
        pasteState(`${T2} ${T1} ${T3}`); // 맨 위 T2 를 열고 쌓인다
        act(() => void pasteState(T1)); // T1 을 다시 열면 맨 위로
        act(() => void pasteState(T3)); // T3 가 맨 위, 열린 것은 T3
        act(() => useTokenHistory.getState().push([T2])); // 기록만 바꿔 맨 위 = T2(열린 것은 그대로 T3)
        renderButton();
        act(() => useUi.getState().toggleTokenHistory());
        expect(selected()).toBe(T3);
    });
    it("전체 지우기 — 확인 줄을 거쳐 지운다, 취소하면 그대로", () => {
        pasteState(`${T1} ${T2}`);
        renderButton();
        act(() => useUi.getState().toggleTokenHistory());
        fireEvent.click(screen.getByRole("button", { name: "전체 지우기" }));
        fireEvent.click(screen.getByRole("button", { name: "취소" }));
        expect(useTokenHistory.getState().entries).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "전체 지우기" }));
        const dialog = screen.getByRole("alertdialog");
        fireEvent.click(dialog.querySelector("button")!);
        expect(useTokenHistory.getState().entries).toHaveLength(0);
    });
});
