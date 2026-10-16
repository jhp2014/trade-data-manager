// 차트 패널 — 가짜 시장 데이터를 주입해 "경로 → 요청 → 클릭 → 경로" 흐름을 확인한다.
// 차트 그리기(lightweight-charts 캔버스)는 jsdom 에서 못 하므로 차트 컴포넌트는 props 를 받아 두는 가짜로 바꾼다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import type { Market } from "../market/ports.js";
import { fakeMarket as stubMarket } from "../market/testing.js";
import type { ChartBundle } from "../market/types.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { Framed, headerLine, openControls, pinToLine, resetHeaderLedger } from "../test/framed.js";
import { ChartPanel } from "./ChartPanel.js";

const seen = vi.hoisted(() => ({ daily: [] as { onPickDate: (d: string) => void; frameKey: string }[], minute: [] as { onPickTime: (t: string) => void; markerTime: number | null }[] }));
vi.mock("../chart/DailyChart.js", () => ({
    DailyChart: (p: { onPickDate: (d: string) => void; frameKey: string }) => {
        seen.daily.push(p);
        return <div data-testid="daily" />;
    },
}));
vi.mock("../chart/MinuteChart.js", () => ({
    MinuteChart: (p: { onPickTime: (t: string) => void; markerTime: number | null }) => {
        seen.minute.push(p);
        return <div data-testid="minute" />;
    },
}));

const bar = { open: "1000", high: "1000", low: "1000", close: "1000", volume: "1" };
/** hold 를 켜면 응답을 붙잡아 두었다가 release() 로 내보낸다(로딩 중 화면을 보려고). */
function fakeMarket(): Market & { calls: string[]; hold: boolean; release: () => void } {
    const calls: string[] = [];
    const held: (() => void)[] = [];
    const m = stubMarket({
        calls,
        hold: false,
        release: () => held.splice(0).forEach((go) => go()),
        chart: async (code: string, date: string): Promise<ChartBundle> => {
            calls.push(`${code}@${date}`);
            if (m.hold) await new Promise<void>((go) => held.push(go));
            return {
                stockCode: code,
                daily: [{ stockCode: code, date, krx: { ...bar, amount: "1" }, un: { ...bar, amount: "1" } }],
                minutes: [{ stockCode: code, date, time: "09:00:00", krx: null, un: bar }],
                basePrice: { krx: 1000, un: 1000 },
            };
        },
        stockMaster: async () => [
            { stockCode: "402340", name: "SK스퀘어", market: "KOSPI" },
            { stockCode: "009150", name: "삼성전기", market: "KOSPI" },
        ],
    });
    return m;
}

function renderPanels(market: Market, panelIds: string[] = ["chart-1"]) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={market}>
                {panelIds.map((id) => (
                    <div key={id} data-testid={`panel-${id}`}>
                        <Framed panelId={id}>
                            <ChartPanel panelId={id} />
                        </Framed>
                    </div>
                ))}
            </MarketProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    resetHeaderLedger();
    seen.daily.length = 0;
    seen.minute.length = 0;
});

afterEach(cleanup);

describe("ChartPanel", () => {
    it("종목·날짜가 없으면 요청하지 않는다", () => {
        const m = fakeMarket();
        renderPanels(m);
        expect(screen.getByText(/종목과 날짜를 넣으세요/)).toBeTruthy();
        expect(m.calls).toEqual([]);
    });

    it("구독한 경로의 (종목, 날짜)로 요청하고, 다른 경로가 바뀌어도 안 따라간다", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31" });
        usePaths.getState().write("B", { code: "009150", date: "2026-07-30" });
        usePaths.getState().bind("chart-1", "A");
        const m = fakeMarket();
        renderPanels(m);
        await screen.findByTestId("daily");
        expect(await screen.findByText("SK스퀘어 402340")).toBeTruthy(); // 헤더 줄의 종목 정보
        // 마운트 뒤에 다른 경로(B)를 바꾸고, 활성도 B 로 옮겨 본다 — A 에 고정된 패널은 그대로여야 한다.
        act(() => usePaths.getState().write("B", { code: "009150", date: "2026-07-15" }));
        await new Promise((r) => setTimeout(r, 20));
        expect(m.calls).toEqual(["402340@2026-07-31"]);
        expect(screen.queryByText(/삼성전기/)).toBeNull();
    });

    it("일봉 선택은 경로 날짜를, 분봉 선택은 경로 시각(HH:MM)을 바꾸고 그 경로가 활성이 된다", async () => {
        usePaths.getState().write("B", { code: "402340", date: "2026-07-31" });
        usePaths.getState().bind("chart-1", "B");
        usePaths.getState().setActive("A");
        const m = fakeMarket();
        renderPanels(m);
        await screen.findByTestId("minute");
        act(() => seen.minute.at(-1)!.onPickTime("09:44:00"));
        expect(usePaths.getState().paths.find((p) => p.id === "B")?.s.time).toBe("09:44");
        expect(usePaths.getState().active).toBe("B");
        act(() => seen.daily.at(-1)!.onPickDate("2026-07-15"));
        await waitFor(() => expect(m.calls).toContain("402340@2026-07-15"));
    });

    it("경로 시각이 분봉 세로선(unix초)으로 간다", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31", time: "09:44" });
        renderPanels(fakeMarket());
        await screen.findByTestId("minute");
        expect(seen.minute.at(-1)!.markerTime).toBe(Date.parse("2026-07-31T09:44:00+09:00") / 1000);
    });

    it("보기 설정은 패널마다 따로", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31" });
        usePanelUiStore.getState().set("chart-1", "view", "daily");
        renderPanels(fakeMarket(), ["chart-1", "chart-2"]);
        const one = await screen.findByTestId("panel-chart-1");
        const two = screen.getByTestId("panel-chart-2");
        await waitFor(() => expect(two.querySelector('[data-testid="minute"]')).not.toBeNull());
        expect(one.querySelector('[data-testid="daily"]')).not.toBeNull();
        expect(one.querySelector('[data-testid="minute"]')).toBeNull();
        expect(two.querySelector('[data-testid="daily"]')).not.toBeNull();
    });

    it("경로가 바뀌어 새 번들을 기다리는 동안 차트를 내리지 않고, 시각선은 긋지 않는다", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31", time: "09:44" });
        const m = fakeMarket();
        renderPanels(m);
        await screen.findByTestId("minute");
        m.hold = true;
        act(() => usePaths.getState().write("A", { date: "2026-07-15" }));
        await waitFor(() => expect(m.calls).toContain("402340@2026-07-15"));
        // 기다리는 동안: 직전 번들의 차트가 그대로 있고(언마운트 없음), 직전 날짜 분봉 위에 새 시각선을 긋지 않는다.
        expect(screen.getByTestId("minute")).toBeTruthy();
        expect(screen.getByText("불러오는 중…")).toBeTruthy();
        expect(seen.minute.at(-1)!.markerTime).toBeNull();
        act(() => m.release());
        await waitFor(() => expect(seen.minute.at(-1)!.markerTime).toBe(Date.parse("2026-07-15T09:44:00+09:00") / 1000));
    });

    it("보기는 컨트롤 판에서 바꾼다 — 기본은 판 안이라 헤더 줄에 컨트롤이 없다", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31" });
        renderPanels(fakeMarket());
        await screen.findByTestId("minute");
        expect(within(headerLine("chart-1")!).queryByText(/둘 다/)).toBeNull(); // 정보(종목·날짜)만
        expect(within(headerLine("chart-1")!).getByText("SK스퀘어 402340")).toBeTruthy();
        openControls("chart-1");
        fireEvent.click(screen.getByRole("button", { name: "일봉" }));
        await waitFor(() => expect(screen.queryByTestId("minute")).toBeNull());
        expect(usePanelUiStore.getState().ui["chart-1"]).toMatchObject({ view: "daily" });
    });

    it("핀으로 꺼낸 컨트롤은 헤더 줄에 서고, 패널 종류 단위로 남는다(차트 (1)에서 꺼내면 (2)에도)", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31" });
        renderPanels(fakeMarket(), ["chart-1", "chart-2"]);
        await screen.findAllByTestId("minute");
        openControls("chart-1");
        pinToLine("view");
        // 줄의 택1(≤3)은 순환 — 누르면 다음 값
        const two = within(headerLine("chart-2")!).getByTitle(/클릭 = 일봉/);
        expect(two.textContent).toContain("둘 다");
        fireEvent.click(two);
        expect(usePanelUiStore.getState().ui["chart-2"]).toMatchObject({ view: "daily" });
        expect(usePanelUiStore.getState().ui["chart-1"]?.view).toBeUndefined(); // 값은 패널마다 따로
        expect(within(headerLine("chart-1")!).getByTitle(/클릭 = 일봉/)).toBeTruthy();
    });
});
