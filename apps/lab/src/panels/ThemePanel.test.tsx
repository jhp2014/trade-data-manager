// 테마 패널(이력 소속) — 가짜 시장 데이터 · 가짜 판단 저장소를 주입해 "그날 이전 이력으로 묶기 → 우클릭 = 종목 이력 창"을 본다.
// 보드 공통 동작(시각 단면 · 승격 · 유니버스 · 헤더)은 SheetThemePanel.test 가 본다 — 같은 몸(ThemeBoardPanel)이다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import type { DayReplay, ReplayStock } from "../market/types.js";
import { kstToUnix } from "../market/domain.js";
import { JudgmentProvider } from "../judgment/JudgmentProvider.js";
import { fakeJudgment, type FakeJudgmentData } from "../judgment/testing.js";
import type { StockHistory } from "../judgment/types.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { LAYER_ATTR } from "../ui/popover/FloatingSurface.js";
import { Framed, headerLine, resetHeaderLedger } from "../test/framed.js";
import { ThemePanel } from "./ThemePanel.js";

const DATE = "2026-07-31";
const T = kstToUnix(DATE, "10:00:00");

// 시트 소속은 일부러 엉뚱하게(「시트」) — 이 패널은 시트를 보지 않는다.
const stock = (code: string, name: string, rate: number, marketCap: string | null = null): ReplayStock => ({
    code, name, themes: ["시트"],
    times: [T], rate: [rate], high: [rate], low: [0], open: 0, cumAmount: [1e9],
    basePrice: { krx: null, un: null }, market: "KOSPI", marketCap,
});
const replay: DayReplay = {
    date: DATE,
    stocks: [stock("000001", "알파", 9, "1230000000000"), stock("000002", "베타", 8), stock("000003", "감마", 7), stock("000004", "델타", 6)],
};

const alphaHistory: StockHistory = {
    code: "000001", name: "알파", asOf: DATE,
    closing: { date: DATE, details: ["반도체 유리기판"], themes: ["유리기판", "반도체"], issue: "유리기판 양산", pct: 9.1, limitUp: false, reasons: ["1. 유리기판 상용화 기대감에 관련주 상승"], sources: ["cafe"] },
    themes: [{ theme: "반도체", n: 3, first: "2025-01-02", last: "2026-07-30", details: ["HBM", "반도체"] }],
    lines: [{ date: "2026-07-30", details: ["HBM"], themes: ["반도체"], issue: "HBM 공급 기대", pct: 12.3, limitUp: false, reasons: [], sources: ["cafe"] }],
    coverage: { from: "2023-02-14", to: "2026-07-30" },
};

const DATE2 = "2026-08-03";
const COVER = { from: "2023-02-14", to: "2026-07-30" };

/** replays: 날짜 → 시계열. gate: 날짜 → 그 시계열 응답을 늦출 약속. */
function renderPanel(data: FakeJudgmentData, opts: { replays?: Record<string, DayReplay>; gate?: Record<string, Promise<void>> } = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const replays = opts.replays ?? { [DATE]: replay };
    const market = fakeMarket({
        dayReplay: async (date: string) => {
            await opts.gate?.[date];
            return replays[date] ?? replay;
        },
    });
    return render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={market}>
                <JudgmentProvider store={fakeJudgment({ coverage: COVER, ...data })}>
                    <Framed panelId="htheme-1">
                        <ThemePanel panelId="htheme-1" />
                    </Framed>
                </JudgmentProvider>
            </MarketProvider>
        </QueryClientProvider>,
    );
}

const cardNames = () => screen.queryAllByTitle(/^카드 (접기|펼치기)$/).map((el) => (el.textContent ?? "").replace(/\d+$/, "").trim());
const layer = () =>
    waitFor(() => {
        const el = document.querySelector(`[${LAYER_ATTR}]`) as HTMLElement | null;
        expect(el).toBeTruthy();
        return within(el!);
    });

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    resetHeaderLedger();
    usePaths.getState().bind("htheme-1", "A");
    usePaths.getState().write("A", { date: DATE, time: "10:00" });
});
afterEach(cleanup);

describe("ThemePanel(이력 소속)", () => {
    it("시트 대신 그날의 이력 소속으로 묶는다 — 묶인 이력이 없는 종목은 「테마 이력 없음」", async () => {
        renderPanel({ themes: { [DATE]: { "000001": ["반도체", "유리기판"], "000002": ["반도체"], "000003": ["조선"] } } });
        await waitFor(() => expect(cardNames()).toContain("반도체"));
        expect(cardNames()).toEqual(["반도체", "개별 종목", "테마 이력 없음"]);
        expect(screen.queryAllByText("시트")).toHaveLength(0);
    });

    it("날짜를 바꾸는 동안 — 직전 날 판에 새 날 소속을 입히지 않는다(새 날 시계열이 오면 그때 바뀐다)", async () => {
        let release!: () => void;
        const gate = { [DATE2]: new Promise<void>((ok) => (release = ok)) };
        const both = { "000001": ["반도체"], "000002": ["반도체"] };
        renderPanel(
            { themes: { [DATE]: both, [DATE2]: { "000001": ["조선"], "000002": ["조선"] } } },
            { replays: { [DATE]: replay, [DATE2]: { ...replay, date: DATE2 } }, gate },
        );
        await waitFor(() => expect(cardNames()).toContain("반도체"));
        act(() => usePaths.getState().write("A", { date: DATE2 }));
        // 새 날 소속은 미리 받아 와도(경로 날짜로) 시계열이 아직 직전 날이면 직전 날 소속 그대로.
        await new Promise((ok) => setTimeout(ok, 30));
        expect(cardNames()).toContain("반도체");
        expect(cardNames()).not.toContain("조선");
        act(() => release());
        await waitFor(() => expect(cardNames()).toContain("조선"));
        expect(cardNames()).not.toContain("반도체");
    });

    it("이력이 덮는 기간 앞의 날짜 — 꼬리 카드는 「이력 범위 밖」, 헤더에 알림", async () => {
        renderPanel({ themes: { [DATE]: {} }, coverage: { from: "2026-08-01", to: "2026-10-14" } });
        await waitFor(() => expect(cardNames()).toEqual(["이력 범위 밖"]));
        expect(headerLine("htheme-1")!.textContent).toContain("이력 범위 앞(2026-08-01~) — 소속 비었음");
    });

    it("종목 줄 우클릭 = 그 종목의 이력 창(시총 · 테마별 · 이력 줄) — 장중이면 장마감 정리는 접혀 있다 · Esc 로 닫힌다", async () => {
        usePanelUiStore.getState().set("htheme-1", "view", "rate"); // 평면 목록 — 줄이 바로 보인다
        renderPanel({ themes: { [DATE]: { "000001": ["반도체"] } }, stocks: { [`000001@${DATE}`]: alphaHistory } });
        fireEvent.contextMenu(await screen.findByText("알파"), { clientX: 40, clientY: 50 });
        const pop = await layer();
        expect(pop.getByTitle("시가총액").textContent).toBe("시총 1.2조");
        expect(await pop.findByText("장마감 정리")).toBeTruthy();
        expect(pop.getByText("3번 · 25.01.02~26.07.30")).toBeTruthy();
        expect(pop.getByText("HBM 공급 기대")).toBeTruthy();
        // 경로 시각 10:00 — 장 마감 뒤 정보는 접혀 있고, 누르면 펼친다.
        expect(pop.getByText("장 마감 뒤 정보 — 지금 시각엔 아직 없다")).toBeTruthy();
        expect(pop.queryByText("1. 유리기판 상용화 기대감에 관련주 상승")).toBeNull();
        fireEvent.click(pop.getByTitle("펼치기"));
        expect(pop.getByText("1. 유리기판 상용화 기대감에 관련주 상승")).toBeTruthy();
        // 판은 다음 매크로태스크에 무장한다(연 그 누름이 아직 전파 중일 수 있어서).
        await new Promise((ok) => setTimeout(ok, 0));
        fireEvent.keyDown(document, { key: "Escape" });
        await waitFor(() => expect(document.querySelector(`[${LAYER_ATTR}]`)).toBeNull());
    });

    it("장 마감 시각(시각 없음)이면 장마감 정리를 펼쳐 둔다", async () => {
        usePaths.getState().write("A", { time: "" });
        usePanelUiStore.getState().set("htheme-1", "view", "rate");
        renderPanel({ themes: { [DATE]: { "000001": ["반도체"] } }, stocks: { [`000001@${DATE}`]: alphaHistory } });
        fireEvent.contextMenu(await screen.findByText("알파"), { clientX: 40, clientY: 50 });
        const pop = await layer();
        expect(await pop.findByText("장중엔 볼 수 없음")).toBeTruthy();
        expect(pop.getByText("1. 유리기판 상용화 기대감에 관련주 상승")).toBeTruthy();
    });

    it("이력 파일이 있어도 기준일이 이력 범위 앞이면 「아직 모른다」(없음으로 단정하지 않는다)", async () => {
        usePanelUiStore.getState().set("htheme-1", "view", "rate");
        const early = { ...alphaHistory, closing: null, themes: [], lines: [], coverage: { from: "2026-08-01", to: "2026-10-14" } };
        renderPanel({ themes: { [DATE]: {} }, stocks: { [`000001@${DATE}`]: early } });
        fireEvent.contextMenu(await screen.findByText("알파"), { clientX: 10, clientY: 10 });
        const pop = await layer();
        expect(await pop.findAllByText("이력 범위 앞(2026-08-01~)이라 아직 모른다.")).toHaveLength(2); // 테마별 · 이력 두 절
    });

    it("이력이 없는 종목 — 이력이 덮는 기간 안이면 「오른 날이 없다」", async () => {
        usePanelUiStore.getState().set("htheme-1", "view", "rate");
        renderPanel({ themes: { [DATE]: {} } });
        fireEvent.contextMenu(await screen.findByText("베타"), { clientX: 10, clientY: 10 });
        expect(await screen.findByText("이력 없음 — 이력(2023-02-14 ~ 2026-07-30)에 이 종목이 오른 날이 없다.")).toBeTruthy();
    });
});
