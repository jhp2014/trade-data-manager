// 시트 테마 패널 — 가짜 시장 데이터를 주입해 "경로 → 그 날짜·시각의 단면 → 클릭 → 경로" 흐름을 확인한다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import type { DayReplay, ReplayStock } from "../market/types.js";
import { kstToUnix } from "../market/domain.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { Framed, headerLine, openControls, pinToLine, resetHeaderLedger } from "../test/framed.js";
import { SheetThemePanel } from "./SheetThemePanel.js";

const DATE = "2026-07-31";
const T0930 = kstToUnix(DATE, "09:30:00");
const T1000 = kstToUnix(DATE, "10:00:00");

// 09:30 엔 반도체(알파·베타) 카드만 — 조선 종목(감마·델타)은 10:00 에 첫 거래가 나와 그때 카드가 생긴다.
const stock = (code: string, name: string, themes: string[], rate: [number, number], times = [T0930, T1000]): ReplayStock => ({
    code, name, themes,
    times, rate, high: rate, low: [0, 0], open: 0, cumAmount: [1e9, 2e9],
    basePrice: { krx: null, un: null }, market: "KOSPI", marketCap: null,
});
const replay: DayReplay = {
    date: DATE,
    stocks: [
        stock("000001", "알파", ["반도체"], [9, 9]),
        stock("000002", "베타", ["반도체"], [8, 8]),
        stock("000003", "감마", ["조선"], [12, 12], [T1000, T1000 + 60]),
        stock("000004", "델타", ["조선"], [11, 11], [T1000, T1000 + 60]),
    ],
};

function renderPanel(calls: string[] = []) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({
        dayReplay: async (date: string) => {
            calls.push(date);
            return replay;
        },
    });
    return render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <Framed panelId="theme-1">
                    <SheetThemePanel panelId="theme-1" />
                </Framed>
            </MarketProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    resetHeaderLedger();
    usePaths.getState().bind("theme-1", "A");
});
afterEach(cleanup);

describe("SheetThemePanel", () => {
    it("날짜가 없으면 요청하지 않는다", () => {
        const calls: string[] = [];
        renderPanel(calls);
        expect(screen.getByText(/날짜를 넣으세요/)).toBeTruthy();
        expect(calls).toEqual([]);
    });

    it("경로의 시각의 단면 — 09:30 엔 조선 카드가 없고, 10:00 엔 있다", async () => {
        usePaths.getState().write("A", { date: DATE, time: "09:30" });
        renderPanel();
        // 테마 이름은 카드 머리와 종목 줄의 다른 테마 칩에도 나올 수 있다 — 개수로 본다.
        expect((await screen.findAllByText("반도체")).length).toBeGreaterThan(0);
        expect(screen.queryAllByText("조선")).toHaveLength(0);
        act(() => usePaths.getState().write("A", { time: "10:00" }));
        expect((await screen.findAllByText("조선")).length).toBeGreaterThan(0);
    });

    it("테마 머리 클릭 = 그 카드 접기/펼치기(경로는 그대로)", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00" });
        renderPanel();
        const header = (await screen.findAllByTitle("카드 펼치기"))[0];
        const before = { ...usePaths.getState().paths.find((p) => p.id === "A")!.s };
        fireEvent.click(header);
        expect(header.title).toBe("카드 접기");
        expect(header.nextElementSibling!.getAttribute("title")).toBe("클릭: 접기"); // 분포 막대도 같은 상태
        fireEvent.click(header);
        expect(header.title).toBe("카드 펼치기");
        expect(usePaths.getState().paths.find((p) => p.id === "A")!.s).toEqual(before);
    });

    it("평면 보기에서 종목 줄 클릭 = 경로의 종목", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00" });
        usePanelUiStore.getState().set("theme-1", "view", "rate");
        renderPanel();
        fireEvent.click(await screen.findByText("알파"));
        const s = usePaths.getState().paths.find((p) => p.id === "A")!.s;
        expect(s.code).toBe("000001");
    });
});

describe("SheetThemePanel — 승격 · 카드 · 유니버스", () => {
    const bandThemes = (container: HTMLElement) =>
        [...container.querySelectorAll('[data-band="current"] [title^="카드 "]')].map((el) => (el.textContent ?? "").replace(/\d+.*$/, "").trim());

    it("이 패널에서 고른 종목은 제자리 — 바깥에서 갔다가 같은 종목으로 돌아오면 다시 올린다", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00", code: "000003" }); // 감마(조선)
        const { container } = renderPanel();
        await waitFor(() => expect(bandThemes(container)).toEqual(["조선"]));
        // 띠 카드(전체로 펼쳐짐)에서 델타(조선)를 이 패널에서 고른다
        fireEvent.click(screen.getAllByText("델타")[0]);
        expect(usePaths.getState().paths.find((p) => p.id === "A")!.s.code).toBe("000004");
        // 바깥에서 알파(반도체)로 → 반도체가 띠로
        act(() => usePaths.getState().write("A", { code: "000001" }));
        await waitFor(() => expect(bandThemes(container)).toEqual(["반도체"]));
        // 바깥에서 다시 델타로 → 이번엔 바깥이므로 조선이 띠로(이 패널이 예전에 고른 종목이어도)
        act(() => usePaths.getState().write("A", { code: "000004" }));
        await waitFor(() => expect(bandThemes(container)).toEqual(["조선"]));
    });

    it("더 큰 테마에 통째로 포함된 테마도 카드로 보인다(자동 숨김 없음)", async () => {
        // 조선 멤버(감마·델타)가 모두 '방산' 에도 속하고 방산은 멤버가 더 많다 → 조선 ⊂ 방산
        replay.stocks.push(stock("000005", "엡실론", ["방산"], [10, 10]));
        replay.stocks[2].themes = ["조선", "방산"];
        replay.stocks[3].themes = ["조선", "방산"];
        try {
            usePaths.getState().write("A", { date: DATE, time: "10:00" });
            renderPanel();
            const headers = () => screen.queryAllByTitle(/^카드 (접기|펼치기)$/).map((el) => el.textContent ?? "");
            await waitFor(() => expect(headers().some((t) => t.startsWith("방산"))).toBe(true));
            expect(headers().some((t) => t.startsWith("조선"))).toBe(true);
            // 카드 머리 = 종목 수만 · 포함관계 칩 = [부모 N [자식 M]] 각 테마의 종목 수
            expect(headers()).toContain("방산3");
            const nest = screen.getAllByTitle("이 테마에 포함된 하위 테마")[0]; // 방산 카드에서
            expect(nest.textContent).toBe("방산3조선2");
            const up = screen.getAllByTitle("이 테마가 속한 상위 테마")[0]; // 조선 카드에서 — 숫자 자리가 같아야
            expect(up.textContent).toBe("방산3조선2");
        } finally {
            replay.stocks.pop();
            replay.stocks[2].themes = ["조선"];
            replay.stocks[3].themes = ["조선"];
        }
    });

    it("겹치는 관련 테마 = 이 카드에 함께 든 종목 / 그 테마 종목", async () => {
        // 알파(반도체)가 조선에도 → 반도체 카드의 관련 테마 「조선」 1/3, 조선 카드의 「반도체」 1/2
        replay.stocks[0].themes = ["반도체", "조선"];
        try {
            usePaths.getState().write("A", { date: DATE, time: "10:00" });
            renderPanel();
            const pill = await screen.findByTitle("관련 테마 — 「조선」 3종목 중 1종목이 이 카드에도 있다");
            expect(pill.textContent).toBe("조선1/3");
            expect(screen.getByTitle("관련 테마 — 「반도체」 2종목 중 1종목이 이 카드에도 있다").textContent).toBe("반도체1/2");
        } finally {
            replay.stocks[0].themes = ["반도체"];
        }
    });

    it("펼치면 주도주 · 틈 · 나머지 — 주도주만 있는 카드엔 틈이 없다", async () => {
        replay.stocks.push(stock("000006", "제타", ["반도체"], [2, 2])); // 2% = 주도주 아님(나머지)
        try {
            usePaths.getState().write("A", { date: DATE, time: "10:00" });
            const { container } = renderPanel();
            await screen.findAllByTitle("클릭: 펼치기");
            for (const bar of screen.getAllByTitle("클릭: 펼치기")) fireEvent.click(bar);
            // 카드마다 [줄 이름 | 틈] 순서
            const cards = [...container.querySelectorAll('[title="클릭: 접기"]')].map((bar) =>
                [...bar.nextElementSibling!.children].map((el) => (el.hasAttribute("data-boundary") ? "|" : (el.textContent ?? "").replace(/^\d+/, "").slice(0, 2))),
            );
            expect(cards).toContainEqual(["알파", "베타", "|", "제타"]);
            expect(cards).toContainEqual(["감마", "델타"]);
        } finally {
            replay.stocks.pop();
        }
    });

    it("카드는 접기/펼치기 두 단계 — 분포 막대를 누르면 펼치고, 다시 누르면 접는다", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00" }); // 종목 없음 → 띠 없음, 카드는 모두 접힘
        renderPanel();
        const bar = (await screen.findAllByTitle("클릭: 펼치기"))[0];
        expect(screen.queryAllByText("알파").length + screen.queryAllByText("감마").length).toBe(0);
        fireEvent.click(bar);
        expect(bar.title).toBe("클릭: 접기");
        expect(screen.queryAllByText("알파").length + screen.queryAllByText("감마").length).toBeGreaterThan(0);
        fireEvent.click(bar);
        expect(bar.title).toBe("클릭: 펼치기");
        expect(screen.queryAllByText("알파").length + screen.queryAllByText("감마").length).toBe(0);
    });

    it("현재 종목이 테마 카드 밖이면 헤더 줄에 그 자리(랭킹 밖)", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00", code: "000001" }); // 알파 = 반도체 카드
        renderPanel();
        const line = headerLine("theme-1")!;
        expect(await screen.findByText("4종목")).toBeTruthy();
        expect(within(line).queryByText(/현재 종목/)).toBeNull();
        act(() => usePaths.getState().write("A", { code: "999999" })); // 그날 없는 종목
        await waitFor(() => expect(within(line).getByText("현재 종목 랭킹 밖")).toBeTruthy());
    });

    it("개별·미분류 자리는 테마 보기에서만 — 평면 목록엔 꼬리 카드가 없다", async () => {
        replay.stocks.push(stock("000007", "에타", [], [9, 9])); // 테마 없음 = 미분류
        try {
            usePaths.getState().write("A", { date: DATE, time: "10:00", code: "000007" });
            renderPanel();
            const line = headerLine("theme-1")!;
            await waitFor(() => expect(within(line).getByText("현재 종목 미분류")).toBeTruthy());
            act(() => usePanelUiStore.getState().set("theme-1", "view", "amount"));
            await waitFor(() => expect(within(line).queryByText(/현재 종목/)).toBeNull());
        } finally {
            replay.stocks.pop();
        }
    });

    it("유니버스 상위 N 은 컨트롤 판에서 바꾸고, 패널 설정으로 남는다", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00" });
        renderPanel();
        expect(await screen.findByText("4종목")).toBeTruthy();
        openControls("theme-1");
        const opener = () => document.querySelector<HTMLButtonElement>('[data-board-row="universe"] button')!;
        fireEvent.click(opener()); // 판 안의 요약 트리거 → 칸 둘이 든 판
        const fields = () => screen.getAllByRole("textbox").filter((el) => (el as HTMLInputElement).title.includes("상위 N")) as HTMLInputElement[];
        const [amount, rate] = fields();
        fireEvent.change(amount, { target: { value: "1" } });
        fireEvent.keyDown(amount, { key: "Enter" });
        fireEvent.change(rate, { target: { value: "0" } });
        fireEvent.keyDown(rate, { key: "Enter" });
        expect(await screen.findByText("1종목")).toBeTruthy();
        expect(usePanelUiStore.getState().ui["theme-1"]).toMatchObject({ amountN: 1, rateN: 0 });
        expect(opener().textContent).toContain("1 ∪ 0"); // 트리거 요약
        // 범위를 넘는 값은 잘린 값으로 보인다(친 글자가 남지 않는다)
        fireEvent.change(amount, { target: { value: "5000" } });
        fireEvent.keyDown(amount, { key: "Enter" });
        await waitFor(() => expect(amount.value).toBe("2000"));
        fireEvent.change(rate, { target: { value: "-3" } });
        fireEvent.keyDown(rate, { key: "Enter" });
        await waitFor(() => expect(rate.value).toBe("0"));
    });

    it("유니버스를 헤더 줄로 꺼내면 줄 모양(renderLine) — 판을 거치지 않고 칸 둘을 바로 고친다", async () => {
        usePaths.getState().write("A", { date: DATE, time: "10:00" });
        renderPanel();
        expect(await screen.findByText("4종목")).toBeTruthy();
        expect(within(headerLine("theme-1")!).queryAllByRole("textbox")).toHaveLength(0); // 기본은 판 안
        openControls("theme-1");
        pinToLine("universe");
        const [amount, rate] = within(headerLine("theme-1")!).getAllByRole("textbox") as HTMLInputElement[];
        expect([amount.title, rate.title]).toEqual(["거래대금 상위 N", "등락률 상위 N"]);
        fireEvent.change(amount, { target: { value: "1" } });
        fireEvent.keyDown(amount, { key: "Enter" });
        fireEvent.change(rate, { target: { value: "0" } });
        fireEvent.keyDown(rate, { key: "Enter" });
        expect(await screen.findByText("1종목")).toBeTruthy();
    });
});
