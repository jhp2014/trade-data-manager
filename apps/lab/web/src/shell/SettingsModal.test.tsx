// 설정 창 — 단축키로 열고(Ctrl+, · ? = 단축키 칸), 칸을 바꾸고, 차트 설정을 고치고, Esc 로 닫는다.
// 입력칸에 글자를 칠 땐 글자 키 단축키가 쉰다.
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, renderHook, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import { usePaths } from "../store/paths.js";
import { useUi } from "../store/ui.js";
import { useChartSettings } from "../store/chartSettings.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { useKeymap } from "../keymap/useKeymap.js";
import { usePopoverLayer } from "../ui/popover/stack.js";
import { SettingsModal } from "./SettingsModal.js";

/** 설정 창은 경로 칸에서 종목 이름을 찾는다 — 시장 데이터 공급자 안에 그린다. */
const render = (ui: ReactElement) =>
    rtlRender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MarketProvider market={fakeMarket({ stockMaster: async () => [{ stockCode: "402340", name: "SK스퀘어", market: "KOSPI" }] })}>{ui}</MarketProvider>
        </QueryClientProvider>,
    );

const key = (k: string, mods: KeyboardEventInit = {}, target: EventTarget = window) =>
    act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods })));

beforeEach(() => {
    localStorage.clear();
    useUi.setState(useUi.getInitialState(), true);
    usePaths.setState(usePaths.getInitialState(), true);
    useChartSettings.setState(useChartSettings.getInitialState(), true);
    useKeymapDynamic.setState({ commands: {} });
});
afterEach(cleanup);

describe("설정 창", () => {
    it("Ctrl+, 로 열고 Esc 로 닫는다 · ? 는 단축키 칸으로 연다", async () => {
        renderHook(() => useKeymap());
        render(<SettingsModal api={null} />);
        key(",", { ctrlKey: true });
        expect(screen.getByRole("dialog", { name: "설정" })).toBeTruthy();
        await act(() => new Promise((r) => setTimeout(r, 0))); // 막 연 판은 한 매크로태스크 뒤에 무장
        key("Escape", {}, document);
        expect(screen.queryByRole("dialog")).toBeNull();
        key("?", { shiftKey: true });
        expect(screen.getByText("단축키 도움말")).toBeTruthy();
        expect(screen.getByText("Ctrl + ,")).toBeTruthy();
    });

    it("입력칸에 칠 땐 글자 키 단축키가 쉰다", () => {
        renderHook(() => useKeymap());
        render(
            <>
                <input aria-label="검색" />
                <SettingsModal api={null} />
            </>,
        );
        key("?", { shiftKey: true }, screen.getByLabelText("검색"));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("단축키 칸은 소유 훅이 얹은 키도 보인다 · 차트 칸에서 이동 폭을 고친다(범위로 잘림)", () => {
        useKeymapDynamic.getState().register({ id: "chart.time.next", title: "시각 +1분", category: "차트", keys: "d", run: () => {} });
        act(() => useUi.getState().openSettings("shortcuts"));
        render(<SettingsModal api={null} />);
        expect(screen.getByText("시각 +1분")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "차트" }));
        const field = screen.getByTitle("1 ~ 240") as HTMLInputElement;
        fireEvent.change(field, { target: { value: "500" } });
        fireEvent.keyDown(field, { key: "Enter" });
        expect(useChartSettings.getState().settings.jumpBars).toBe(240);
        expect(field.value).toBe("240");
    });

    it("열린 채 ? 를 누르면 단축키 칸으로 · 숫자 칸의 Esc 는 되돌리기만(창은 그대로)", async () => {
        renderHook(() => useKeymap());
        act(() => useUi.getState().openSettings("chart"));
        render(<SettingsModal api={null} />);
        await act(() => new Promise((r) => setTimeout(r, 0)));
        const field = screen.getByTitle("1 ~ 240") as HTMLInputElement;
        fireEvent.change(field, { target: { value: "77" } });
        fireEvent.keyDown(field, { key: "Escape" });
        expect(field.value).toBe("20");
        expect(screen.getByRole("dialog")).toBeTruthy();
        key("?", { shiftKey: true });
        expect(screen.getByText("단축키 도움말")).toBeTruthy();
        // 되돌릴 게 없는 Esc 는 흘러 창이 닫힌다
        fireEvent.click(screen.getByRole("button", { name: "차트" }));
        fireEvent.keyDown(screen.getByTitle("1 ~ 240"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("창을 열면 떠 있던 판은 닫힌다", async () => {
        let closed = 0;
        function Floating(): JSX.Element {
            const ref = useRef<HTMLDivElement>(null);
            usePopoverLayer({ surfaceRef: ref, onClose: () => closed++ });
            return <div ref={ref}>판</div>;
        }
        render(
            <>
                <Floating />
                <SettingsModal api={null} />
            </>,
        );
        act(() => useUi.getState().openSettings());
        expect(closed).toBe(1);
    });

    it("경로 칸 — 추가하면 활성 경로 상황을 복사해 펼친 채 활성, 지우기는 확인 줄을 거친다(마지막 하나는 못 지운다)", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31", time: "10:00" });
        act(() => useUi.getState().openSettings("paths"));
        render(<SettingsModal api={null} />);
        expect(await screen.findByText(/2026-07-31 \(금\) · 10:00 · SK스퀘어/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "+ 경로 추가" }));
        const c = usePaths.getState().paths.find((p) => p.id === "C")!;
        expect(c).toMatchObject({ open: true, s: { code: "402340", date: "2026-07-31", time: "10:00" } });
        expect(usePaths.getState().active).toBe("C");
        fireEvent.click(screen.getAllByRole("button", { name: "지우기" })[2]); // C 줄
        expect(screen.getByRole("alertdialog", { name: /경로 C 를 지울까요/ })).toBeTruthy();
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "지우기" }));
        expect(usePaths.getState().paths.map((p) => p.id)).toEqual(["A", "B"]);
        act(() => usePaths.getState().removePath("B"));
        expect(screen.queryAllByRole("button", { name: "지우기" })).toHaveLength(0);
    });

    it("패널 칸 — dockview 가 없으면 열기 버튼은 못 누른다", () => {
        act(() => useUi.getState().openSettings("panels"));
        render(<SettingsModal api={null} />);
        expect((screen.getByRole("button", { name: "+ 차트" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
