// 테마 보드 판 — 새 날짜를 받는 동안: 직전 판을 흐리게(그 판의 종목 그대로) + 가운데 카드, 도착하면 새 종목 테마를 위로.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import { kstToUnix } from "../market/domain.js";
import type { DayFlow, LabReplayDay } from "../market/types.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { useRowNav } from "../store/rowNav.js";
import { useKeymap } from "../keymap/useKeymap.js";
import { Framed, resetHeaderLedger } from "../test/framed.js";
import { BoardPanel } from "./BoardPanel.js";

/** 종목 → 테마들. 000003 은 두 테마(반도체 · HBM) — shift+w/s 로 선택 테마를 바꾼다. */
const THEMES: Record<string, string[]> = { "000001": ["조선"], "000002": ["조선"], "000003": ["반도체", "HBM"], "000004": ["반도체"], "000005": ["HBM"] };

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
    return { date, rows: Object.entries(THEMES).map(([code, themes]) => ({ code, name: code, labels: themes.map((theme) => ({ theme, basis: ["issue"], from: "open" })), why: "" })) };
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
    useRowNav.setState({ attached: null });
});
afterEach(cleanup);

const stale = (): boolean => document.querySelector("[data-stale]") !== null;
const pendingCard = (): Element | null => document.querySelector("[data-pending-card]");

/** 앱처럼 전역 단축키 디스패처를 하나 건다. */
function Keys(): null {
    useKeymap();
    return null;
}

/** 판을 띄우고 000003(반도체) @ 2026-11-12 14:05 가 다 그려질 때까지 기다린다. */
async function mountReady(m: ReturnType<typeof market>): Promise<void> {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <Keys />
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

const pathCode = (): string => usePaths.getState().paths.find((p) => p.id === usePaths.getState().active)!.s.code;
const press = (key: string, shiftKey = false): void => {
    fireEvent.keyDown(window, { key, shiftKey });
};
/** 띠(현재 종목)에서 그 테마 이름 — 부착 판에선 누르면 선택, 아니면 접기. */
const bandThemeName = (theme: string): HTMLElement => document.querySelector<HTMLElement>(`[data-band="current"] [data-theme-name="${theme}"]`)!;
/** 탭 우클릭 「w/s 부착」과 같은 일. */
const attachBoard = (): void => act(() => useRowNav.getState().attach("board-1"));
const selectedTheme = (): string | null => document.querySelector('[data-nav-theme="selected"]')?.textContent ?? null;

describe("BoardPanel — w/s 순회", () => {
    it("부착 전엔 w/s 가 아무것도 안 하고, 선택 테마도 안 보이고, 이름 클릭은 머리처럼 접기다", async () => {
        await mountReady(market());
        expect(selectedTheme()).toBeNull();
        press("s");
        expect(pathCode()).toBe("000003");
        const card = bandThemeName("HBM").closest('[data-band="current"]')!;
        const rowsBefore = card.querySelectorAll("button").length;
        fireEvent.click(bandThemeName("HBM"));
        expect(selectedTheme()).toBeNull();
        expect(useRowNav.getState().attached).toBeNull();
        expect(card.querySelectorAll("button").length).toBeLessThan(rowsBefore); // 접혔다
    });

    it("부착하면 현재 종목 첫 테마가 알약 — 이름 클릭으로 테마를 고르고, w/s 가 그 안을 돌고, 끝에서 처음으로", async () => {
        await mountReady(market());
        attachBoard();
        await waitFor(() => expect(selectedTheme()).toBe(document.querySelector('[data-band="current"] [data-theme-name]')?.textContent)); // 부착만으로 띠 첫 테마가 알약
        fireEvent.click(bandThemeName("HBM"));
        expect(selectedTheme()).toBe("HBM");
        expect(pathCode()).toBe("000003"); // 현재 종목이 든 테마라 종목은 그대로
        press("s");
        expect(pathCode()).toBe("000005");
        await waitFor(() => expect(selectedTheme()).toBe("HBM")); // 걸어도 선택 테마는 그대로(새 종목도 HBM)
        press("s");
        expect(pathCode()).toBe("000003"); // 순환
        press("w");
        expect(pathCode()).toBe("000005");
    });

    it("shift+w/s 는 현재 종목의 테마들 사이에서 선택을 바꾼다 — 그 뒤 w/s 는 새 테마 안", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.click(bandThemeName("반도체"));
        expect(selectedTheme()).toBe("반도체");
        press("S", true);
        await waitFor(() => expect(selectedTheme()).toBe("HBM"));
        press("S", true);
        await waitFor(() => expect(selectedTheme()).toBe("반도체")); // 순환
        press("s");
        expect(pathCode()).toBe("000004");
    });

    it("새 날짜를 받는 동안엔 걷지 않는다", async () => {
        const m = market();
        await mountReady(m);
        attachBoard();
        fireEvent.click(bandThemeName("반도체"));
        m.hold = true;
        write({ date: "2026-11-14" });
        await waitFor(() => expect(pendingCard()).not.toBeNull());
        press("s");
        expect(pathCode()).toBe("000003");
        act(() => m.release());
        await waitFor(() => expect(pendingCard()).toBeNull());
        await waitFor(() => expect(selectedTheme()).toBe("반도체"));
        press("s");
        expect(pathCode()).toBe("000004");
    });


    it("평면 목록 보기에선 걷지 않는다", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.click(bandThemeName("반도체"));
        act(() => usePanelUiStore.getState().set("board-1", "view", "amount"));
        press("s");
        expect(pathCode()).toBe("000003");
    });

    it("걸으면 선택 카드 안의 현재 종목 줄을 화면으로 데려온다", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.click(bandThemeName("반도체"));
        const seen: Element[] = [];
        const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
            seen.push(this);
        });
        press("s");
        await waitFor(() => expect(seen.some((el) => el.getAttribute("data-selected") === "true" && el.textContent?.includes("000004"))).toBe(true));
        spy.mockRestore();
    });

    it("띠 카드에서 종목을 직접 고르면 선택 테마가 바뀌어도 판은 제자리", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.click(bandThemeName("반도체"));
        const spy = vi.spyOn(Element.prototype, "scrollIntoView");
        const hbmCard = bandThemeName("HBM").closest('[data-band="current"]')!;
        const row = [...hbmCard.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes("000005"))!;
        fireEvent.click(row);
        expect(pathCode()).toBe("000005");
        await waitFor(() => expect(selectedTheme()).toBe("HBM")); // 000005 는 반도체에 없다 → 선택 테마가 HBM 으로
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("shift+w/s 로 테마만 바꾸면 그 카드로 스크롤한다", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.click(bandThemeName("반도체"));
        const seen: Element[] = [];
        const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
            seen.push(this);
        });
        press("S", true);
        await waitFor(() => expect(seen.some((el) => el.querySelector('[data-theme-name="HBM"]') !== null)).toBe(true));
        spy.mockRestore();
    });




    it("띠 밖(현재 종목이 없는) 테마 이름 클릭은 선택이 아니라 접기다", async () => {
        await mountReady(market());
        attachBoard();
        await waitFor(() => expect(selectedTheme()).toBe("반도체"));
        fireEvent.click(document.querySelector<HTMLElement>('[data-theme-name="조선"]')!);
        expect(selectedTheme()).toBe("반도체");
        expect(pathCode()).toBe("000003");
    });

    const headOf = (theme: string): HTMLElement => document.querySelector<HTMLElement>(`[data-theme-name="${theme}"]`)!.parentElement!;
    const navItem = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-nav-menu] [role="menuitem"]');

    it("카드 머리 우클릭 「테마 선택」 ON/OFF — 끄면 알약 없음·w/s 쉼, shift+s 로 다시 켠다", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.contextMenu(headOf("HBM"));
        expect(navItem()?.textContent).toBe("○테마 선택");
        fireEvent.click(navItem()!);
        await waitFor(() => expect(selectedTheme()).toBe("HBM"));
        expect(navItem()).toBeNull(); // 누르면 닫힌다
        fireEvent.contextMenu(headOf("HBM"));
        expect(navItem()?.textContent).toBe("●테마 선택");
        fireEvent.click(navItem()!);
        await waitFor(() => expect(selectedTheme()).toBeNull());
        press("s");
        expect(pathCode()).toBe("000003"); // 꺼 두면 걷지 않는다
        press("S", true);
        await waitFor(() => expect(selectedTheme()).not.toBeNull()); // shift+s 로 다시 켠다
    });

    it("현재 종목이 없는 테마에선 「테마 선택」이 흐리고 눌러도 그대로", async () => {
        await mountReady(market());
        attachBoard();
        await waitFor(() => expect(selectedTheme()).toBe("반도체"));
        fireEvent.contextMenu(headOf("조선"));
        expect(navItem()?.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(navItem()!);
        expect(selectedTheme()).toBe("반도체");
    });

    it("메뉴는 같은 머리 다시 우클릭·머리 클릭·바깥 누름으로 닫힌다(머리 클릭은 접지 않고 닫기만)", async () => {
        await mountReady(market());
        attachBoard();
        const head = headOf("반도체");
        fireEvent.contextMenu(head);
        expect(navItem()).not.toBeNull();
        fireEvent.contextMenu(head);
        expect(navItem()).toBeNull();
        fireEvent.contextMenu(head);
        const title = head.title;
        fireEvent.click(head);
        expect(navItem()).toBeNull();
        expect(head.title).toBe(title); // 접히지 않았다
        fireEvent.contextMenu(head);
        await new Promise((r) => setTimeout(r, 0)); // 막 연 판은 한 틱 뒤에 바깥 누름에 무장한다(공용 층)
        fireEvent.mouseDown(document.body);
        expect(navItem()).toBeNull();
    });

    it("부착 안 된 판에선 머리 우클릭 메뉴가 없다", async () => {
        await mountReady(market());
        fireEvent.contextMenu(headOf("반도체"));
        expect(document.querySelector("[data-nav-menu]")).toBeNull();
    });

    it("숨은 옛 선택이 되살아나지 않는다 — 첫 테마로 대신한 테마를 굳혀, 옛 테마에도 든 종목에 닿아도 그대로", async () => {
        await mountReady(market());
        attachBoard();
        fireEvent.click(bandThemeName("반도체")); // 000003 에서 반도체를 고른다
        await waitFor(() => expect(selectedTheme()).toBe("반도체"));
        write({ code: "000005" }); // 바깥에서 HBM 전용 종목으로 — 반도체가 안 맞아 HBM 으로 대신(굳힌다)
        await waitFor(() => expect(selectedTheme()).toBe("HBM"));
        write({ code: "000003" }); // 반도체이기도 한 종목 — 옛 선택(반도체)이 되살아나면 안 된다
        await waitFor(() => expect(pathCode()).toBe("000003"));
        expect(selectedTheme()).toBe("HBM");
        press("s");
        expect(pathCode()).toBe("000005"); // HBM 안을 그대로 걷는다
    });
});

