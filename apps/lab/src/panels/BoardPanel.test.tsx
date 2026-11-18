// 테마 보드 판 — 새 날짜를 받는 동안: 직전 판을 흐리게(그 판의 종목 그대로) + 가운데 카드, 도착하면 새 종목 테마를 위로.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import { kstToUnix } from "../market/domain.js";
import type { DayFlow, LabReplayDay } from "../market/types.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { Framed, resetHeaderLedger } from "../test/framed.js";
import { BoardPanel } from "./BoardPanel.js";

const THEMES: Record<string, string> = { "000001": "조선", "000002": "조선", "000003": "반도체", "000004": "반도체" };

function flowOf(date: string): DayFlow {
    const t = kstToUnix(date, "09:00:00");
    return {
        date,
        stocks: Object.keys(THEMES).map((code, i) => ({
            code,
            times: [t],
            close: [1100 + i],
            high: [1100 + i],
            low: [1000],
            amount: [1_000_000_000],
            open: 1000,
            basePrice: { krx: 1000, un: 1000 },
            marketCap: null,
        })),
    };
}

function replayOf(date: string): LabReplayDay {
    return { date, rows: Object.entries(THEMES).map(([code, theme]) => ({ code, name: code, labels: [{ theme, basis: ["issue"], from: "open" }], why: "" })) };
}

/** hold 를 켜면 /day-flow 응답을 붙잡아 두었다가 release() 로 내보낸다. fail 에 든 날짜는 실패한다. */
function market() {
    const held: (() => void)[] = [];
    const m = fakeMarket({
        hold: false,
        fail: new Set<string>(),
        release: () => held.splice(0).forEach((go) => go()),
        dayFlow: async (date: string): Promise<DayFlow> => {
            if (m.hold) await new Promise<void>((go) => held.push(go));
            if (m.fail.has(date)) throw new Error("서버 오류");
            return flowOf(date);
        },
        replayDay: async (date: string) => replayOf(date),
        stockMaster: async () => [
            { stockCode: "000001", name: "한화오션", market: "KOSPI" },
            { stockCode: "000003", name: "한미반도체", market: "KOSPI" },
        ],
    });
    return m;
}

const write = (patch: { code?: string; date?: string; time?: string }): void => act(() => usePaths.getState().write(usePaths.getState().active, patch));
const band = (): string[] => [...document.querySelectorAll('[data-band="current"]')].map((el) => el.textContent ?? "");

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    resetHeaderLedger();
});
afterEach(cleanup);

const stale = (): boolean => document.querySelector("[data-stale]") !== null;
const pendingCard = (): Element | null => document.querySelector("[data-pending-card]");

/** 판을 띄우고 000003(반도체) @ 2026-11-12 14:05 가 다 그려질 때까지 기다린다. */
async function mountReady(m: ReturnType<typeof market>): Promise<void> {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <Framed panelId="board-1">
                    <BoardPanel panelId="board-1" />
                </Framed>
            </MarketProvider>
        </QueryClientProvider>,
    );
    write({ code: "000003", date: "2026-11-12", time: "14:05" });
    await waitFor(() => expect(band().some((t) => t.includes("반도체"))).toBe(true));
    expect(stale()).toBe(false);
}

describe("BoardPanel — 새 날짜를 받는 동안", () => {
    it("직전 판을 그 판의 종목 그대로 흐리게 두고 가운데 카드로 알린다 — 도착하면 새 종목 테마를 위로", async () => {
        const m = market();
        await mountReady(m);

        // 토큰 붙여넣기 — 종목·날짜·시각이 한꺼번에 바뀐다. 새 날짜 시계열은 붙잡아 둔다.
        m.hold = true;
        write({ code: "000001", date: "2026-11-14", time: "10:32" });
        const card = await screen.findByRole("status");
        expect(card.textContent).toContain("2026-11-14 10:32 불러오는 중…");
        expect(card.textContent).toContain("흐린 판 = 2026-11-12 14:05");
        expect(card.textContent).toContain("도착하면 한화오션 자리로");
        expect(document.querySelector("[data-stale]")).not.toBeNull();
        // 옛 판에 새 종목을 먼저 올리지 않는다 — 띠는 여전히 직전 종목(반도체)의 것.
        expect(band().some((t) => t.includes("반도체"))).toBe(true);
        expect(band().some((t) => t.includes("조선"))).toBe(false);
        // 헤더도 판이 그리는 날짜·시각을 말한다.
        expect(document.querySelector('[data-header-line="line"]')?.textContent ?? "").not.toContain("2026-11-14");

        act(() => m.release());
        await waitFor(() => expect(document.querySelector("[data-pending-card]")).toBeNull());
        expect(document.querySelector("[data-stale]")).toBeNull();
        await waitFor(() => expect(band().some((t) => t.includes("조선"))).toBe(true));
        expect(band().some((t) => t.includes("반도체"))).toBe(false);
    });

    it("대기 중 또 안 받은 날짜로 가면 흐린 판은 그대로, 카드의 목표만 바뀐다", async () => {
        const m = market();
        await mountReady(m);
        m.hold = true;
        write({ code: "000001", date: "2026-11-14" });
        await waitFor(() => expect(pendingCard()).not.toBeNull());
        write({ date: "2026-11-17" });
        await waitFor(() => expect(pendingCard()?.textContent).toContain("2026-11-17"));
        expect(pendingCard()?.textContent).toContain("흐린 판 = 2026-11-12 14:05");
        expect(band().some((t) => t.includes("반도체"))).toBe(true);
        act(() => m.release());
        await waitFor(() => expect(pendingCard()).toBeNull());
        await waitFor(() => expect(band().some((t) => t.includes("조선"))).toBe(true));
    });

    it("대기 중 받아 둔 날짜로 돌아오면 흐림이 바로 풀리고 경로 종목을 올린다", async () => {
        const m = market();
        await mountReady(m);
        m.hold = true;
        write({ code: "000001", date: "2026-11-14" });
        await waitFor(() => expect(pendingCard()).not.toBeNull());
        write({ date: "2026-11-12" });
        await waitFor(() => expect(pendingCard()).toBeNull());
        expect(stale()).toBe(false);
        await waitFor(() => expect(band().some((t) => t.includes("조선"))).toBe(true));
    });

    it("날짜가 빈 경로로 옮기면 대기가 아니다 — 흐림·카드 없음, 헤더 날짜도 비움", async () => {
        const m = market();
        await mountReady(m);
        act(() => usePaths.getState().setActive("B")); // 기본 경로 B 는 빈 상황 — 패널은 활성을 따라간다
        await screen.findByText(/에 날짜를 넣으세요/);
        expect(stale()).toBe(false);
        expect(pendingCard()).toBeNull();
        expect(document.querySelector('[data-header-line="line"]')?.textContent ?? "").not.toContain("2026-11-12");
    });

    it("새 날짜 받기가 실패하면 흐림·카드를 걷고 오류를 보인다", async () => {
        const m = market();
        await mountReady(m);
        m.fail.add("2026-11-14");
        write({ code: "000001", date: "2026-11-14" });
        await screen.findByText(/테마 오류/);
        expect(stale()).toBe(false);
        expect(pendingCard()).toBeNull();
    });
});
