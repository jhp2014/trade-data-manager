// HTS뉴스 패널 — 가짜 창구를 주입해 "경로 → 요청 인자 → 목록 → 클릭 → 경로" 흐름을 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import type { NewsData } from "../market/ports.js";
import { fakeMarket } from "../market/testing.js";
import type { HtsNewsItem } from "../market/types.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { HTS_PAGE } from "../news/htsFeed.js";
import { Framed, headerLine, openControls, pinToLine, resetHeaderLedger } from "../test/framed.js";
import { HtsNewsPanel } from "./HtsNewsPanel.js";

type HtsArgs = Parameters<NewsData["htsNews"]>[0];

const DATE = "2026-07-31";
const news = (srno: string, time: string, title: string, date = DATE): HtsNewsItem => ({ srno, date, time, title, sourceName: "연합", categoryCode: "" });

const DAY = [
    news("30", "14:10:00", "알파 오후 공시"),
    news("20", "10:05:00", "알파 수주"),
    news("10", "09:10:00", "알파 장 초반 급등"),
];
const OLDER = [news("90", "15:00:00", "알파 전날 마감", "2026-07-30")];

/** pages 를 차례로 돌려준다(장마다 하나). 받은 인자를 calls 에 남긴다. */
function renderPanel(pages: HtsNewsItem[][] = [DAY, OLDER], calls: HtsArgs[] = []) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({
        htsNews: async (args: HtsArgs) => {
            calls.push(args);
            return pages[calls.length - 1] ?? [];
        },
        stockMaster: async () => [{ stockCode: "000001", name: "알파", market: "KOSPI" }],
    });
    render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <Framed panelId="hts-1">
                    <HtsNewsPanel panelId="hts-1" />
                </Framed>
            </MarketProvider>
        </QueryClientProvider>,
    );
    return calls;
}

const pathA = () => usePaths.getState().paths.find((p) => p.id === "A")!.s;
const rowOf = (text: string) => screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === text).parentElement!;

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    resetHeaderLedger();
    usePaths.getState().bind("hts-1", "A");
});
afterEach(cleanup);

describe("HtsNewsPanel — 요청", () => {
    it("날짜가 없으면 요청하지 않는다", () => {
        usePaths.getState().write("A", { code: "000001" });
        const calls = renderPanel();
        expect(screen.getByText(/날짜를 넣으세요/)).toBeTruthy();
        expect(calls).toEqual([]);
    });

    it("종목 범위 = 경로의 종목·날짜로 첫 장을 요청한다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        const calls = renderPanel();
        await waitFor(() => expect(rowOf("알파 수주")).toBeTruthy());
        expect(calls[0]).toEqual({ code: "000001", q: undefined, date: DATE, before: null, limit: HTS_PAGE });
    });

    it("종목 범위인데 종목이 없으면 안내만 하고 요청하지 않는다", () => {
        usePaths.getState().write("A", { date: DATE });
        const calls = renderPanel();
        expect(screen.getByText(/종목을 넣으세요/)).toBeTruthy();
        expect(calls).toEqual([]);
    });

    it("전체 시황 범위는 code 없이 요청하고, 범위는 패널 설정으로 남는다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        const calls = renderPanel();
        openControls("hts-1"); // 범위는 컨트롤 판 안(기본)
        fireEvent.click(screen.getByRole("button", { name: "전체 시황" }));
        await waitFor(() => expect(calls.some((a) => a.code === undefined)).toBe(true));
        expect(calls.find((a) => a.code === undefined)).toMatchObject({ date: DATE, before: null });
        expect(usePanelUiStore.getState().ui["hts-1"]).toMatchObject({ scope: "all" });
    });

    it("검색어는 Enter 로 확정해 q 로 보내고, 지우면 원래 요청으로 돌아간다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        const calls = renderPanel([DAY, [DAY[1]], DAY]);
        await waitFor(() => expect(calls).toHaveLength(1));
        const box = screen.getByPlaceholderText("제목 키워드");
        fireEvent.change(box, { target: { value: " 수주 " } });
        expect(calls).toHaveLength(1); // 치는 동안은 요청하지 않는다
        fireEvent.keyDown(box, { key: "Enter" });
        await waitFor(() => expect(calls[1]).toMatchObject({ code: "000001", q: "수주", before: null }));
        // 검색어 강조
        await waitFor(() => expect(screen.getAllByText("수주").some((el) => el.tagName === "MARK")).toBe(true));
        fireEvent.change(box, { target: { value: "" } });
        fireEvent.keyDown(box, { key: "Enter" });
        // 원래 키로 돌아가면 캐시가 있어 다시 받지 않는다 — 원래 목록이 보이면 된다
        await waitFor(() => expect(rowOf("알파 오후 공시")).toBeTruthy());
        expect(calls.every((a, i) => i === 1 || a.q === undefined)).toBe(true);
    });
});

describe("HtsNewsPanel — 검색칸(헤더 search 컨트롤)", () => {
    it("기본은 헤더 줄 — 판에 넣어도 같은 칸·같은 확정(Enter)이고, 확정한 검색어가 따라간다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        const calls = renderPanel([DAY, [DAY[1]], [DAY[0]]]);
        await waitFor(() => expect(calls).toHaveLength(1));
        const box = within(headerLine("hts-1")!).getByPlaceholderText("제목 키워드") as HTMLInputElement;
        fireEvent.change(box, { target: { value: "수주" } });
        fireEvent.keyDown(box, { key: "Enter" });
        await waitFor(() => expect(calls[1]).toMatchObject({ q: "수주" }));

        // 판에서 핀을 눌러 줄에서 넣는다 → 칸은 판 안에만, 확정값이 그대로 보인다
        openControls("hts-1");
        fireEvent.click(document.querySelector<HTMLElement>('[data-board-row="keyword"] [aria-label="헤더 줄에서 넣기"]')!);
        expect(within(headerLine("hts-1")!).queryByPlaceholderText("제목 키워드")).toBeNull();
        const inBoard = screen.getByPlaceholderText("제목 키워드") as HTMLInputElement;
        expect(inBoard.value).toBe("수주");
        fireEvent.change(inBoard, { target: { value: "공시" } });
        fireEvent.keyDown(inBoard, { key: "Enter" });
        await waitFor(() => expect(calls[2]).toMatchObject({ q: "공시" }));
        expect(usePanelUiStore.getState().ui["hts-1"]).toMatchObject({ keyword: "공시" });
    });

    it("Enter 없이 떠나거나 Esc 면 칸이 확정값으로 돌아간다(요청 없음)", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        usePanelUiStore.getState().set("hts-1", "keyword", "수주");
        const calls = renderPanel();
        await waitFor(() => expect(calls).toHaveLength(1));
        const box = screen.getByPlaceholderText("제목 키워드") as HTMLInputElement;
        fireEvent.change(box, { target: { value: "다른" } });
        fireEvent.blur(box);
        expect(box.value).toBe("수주");
        fireEvent.change(box, { target: { value: "다른" } });
        fireEvent.keyDown(box, { key: "Escape" });
        expect(box.value).toBe("수주");
        await new Promise((r) => setTimeout(r, 20));
        expect(calls).toHaveLength(1);
    });

    it("범위를 헤더 줄로 꺼내면 줄에서 순환으로 바꾼다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        const calls = renderPanel();
        openControls("hts-1");
        pinToLine("scope");
        fireEvent.click(within(headerLine("hts-1")!).getByTitle(/클릭 = 전체 시황/));
        await waitFor(() => expect(calls.some((a) => a.code === undefined)).toBe(true));
        expect(within(headerLine("hts-1")!).getAllByText("전체 시황").length).toBeGreaterThan(0); // 대상 정보도 바뀐다
    });
});

describe("HtsNewsPanel — 더 가져오기", () => {
    it("가장 과거 항목의 (date, srno) 로 다음 장을 받고, 짧은 장 뒤엔 버튼이 사라진다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        const calls = renderPanel([DAY, OLDER]);
        // 종목+무키워드 첫 장은 "그 날 전체" — 짧아도 더 가져올 수 있다
        fireEvent.click(await screen.findByText("더 가져오기"));
        await waitFor(() => expect(rowOf("알파 전날 마감")).toBeTruthy());
        expect(calls[1]).toEqual({ code: "000001", q: undefined, date: DATE, before: { date: DATE, srno: "10" }, limit: HTS_PAGE });
        expect(screen.queryByText("더 가져오기")).toBeNull();
        expect(screen.getByText("2026-07-30 (목)")).toBeTruthy(); // 날짜가 바뀌는 곳에 구분
    });

    it("전체 시황 첫 장이 limit 미만이면 처음부터 버튼이 없다", async () => {
        usePaths.getState().write("A", { date: DATE });
        usePanelUiStore.getState().set("hts-1", "scope", "all");
        renderPanel([DAY]);
        await waitFor(() => expect(rowOf("알파 수주")).toBeTruthy());
        expect(screen.queryByText("더 가져오기")).toBeNull();
    });
});

describe("HtsNewsPanel — 사후 정보 · 줄 클릭", () => {
    it("경로 시각보다 나중 뉴스는 흐리게, 경계에 구분선 — 시각이 없으면 구분 없음", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE, time: "10:05" });
        renderPanel();
        await waitFor(() => expect(rowOf("알파 수주")).toBeTruthy());
        expect(rowOf("알파 오후 공시").dataset.after).toBe("true");
        expect(rowOf("알파 수주").dataset.after).toBeUndefined(); // 같은 분 = 이미 아는 것
        expect(rowOf("알파 장 초반 급등").dataset.after).toBeUndefined();
        const line = screen.getByText(/경로 시각 10:05 이후/);
        // 구분선은 사후 뉴스 아래, 아는 뉴스 위
        expect(rowOf("알파 오후 공시").compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(line.compareDocumentPosition(rowOf("알파 수주")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        act(() => usePaths.getState().write("A", { time: "" }));
        expect(screen.queryByText(/이후/)).toBeNull();
        expect(rowOf("알파 오후 공시").dataset.after).toBeUndefined();
    });

    it("같은 날짜 줄 클릭 = 경로 시각을 그 뉴스의 분으로, 다른 날짜 줄은 아무 일 없음", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE, time: "15:00" });
        renderPanel();
        await waitFor(() => expect(rowOf("알파 수주")).toBeTruthy());
        fireEvent.click(rowOf("알파 장 초반 급등"));
        expect(pathA().time).toBe("09:10");
        expect(rowOf("알파 수주").dataset.after).toBe("true");

        fireEvent.click(screen.getByText("더 가져오기"));
        await waitFor(() => expect(rowOf("알파 전날 마감")).toBeTruthy());
        fireEvent.click(rowOf("알파 전날 마감"));
        expect(pathA()).toMatchObject({ date: DATE, time: "09:10" });
    });
});

describe("HtsNewsPanel — 경계 · 스크롤 · 남는 검색어", () => {
    it("나중 뉴스가 하나도 없으면 경계선을 긋지 않는다", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE, time: "15:00" });
        renderPanel();
        await waitFor(() => expect(rowOf("알파 수주")).toBeTruthy());
        expect(screen.queryByText(/경로 시각 15:00 이후/)).toBeNull();
    });

    it("경로 시각이 바깥에서 바뀌면 경계로 한 번 스크롤 — 같은 시각엔 다시 안 하고, 패널 안 줄 클릭엔 안 한다", async () => {
        const spy = vi.spyOn(Element.prototype, "scrollIntoView");
        spy.mockClear();
        usePaths.getState().write("A", { code: "000001", date: DATE, time: "10:00" });
        renderPanel();
        await waitFor(() => expect(rowOf("알파 수주")).toBeTruthy());
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(1)); // 첫 경계(10:00)
        act(() => usePaths.getState().write("A", { time: "10:00" })); // 같은 시각을 다시 씀 — 다시 안 함
        expect(spy).toHaveBeenCalledTimes(1);
        act(() => usePaths.getState().write("A", { time: "09:30" })); // 바깥에서 시각이 바뀜
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
        fireEvent.click(rowOf("알파 수주")); // 패널 안 줄 클릭 → 경로 시각 10:05, 스크롤 없음
        expect(pathA().time).toBe("10:05");
        await new Promise((r) => setTimeout(r, 20));
        expect(spy).toHaveBeenCalledTimes(2);
        spy.mockRestore();
    });

    it("확정한 검색어는 패널 설정에 남는다(다시 붙여도)", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        usePanelUiStore.getState().set("hts-1", "keyword", "수주");
        const calls = renderPanel();
        await waitFor(() => expect(calls[0]?.q).toBe("수주"));
        expect((screen.getByDisplayValue("수주") as HTMLInputElement).value).toBe("수주");
    });

    it("제목의 깨진 제어문자(U+001A)는 가운뎃점으로", async () => {
        usePaths.getState().write("A", { code: "000001", date: DATE });
        renderPanel([[news("1", "09:00:00", "아마존 실적반도체")]]);
        await waitFor(() => expect(screen.getByText("아마존 실적·반도체")).toBeTruthy());
    });
});
