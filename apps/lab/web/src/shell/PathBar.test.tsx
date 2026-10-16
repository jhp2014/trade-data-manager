// 경로 줄 — 입력칸 없이: 이름표 = 활성, 펼침/접음은 마우스를 올리면 나오는 ▸/◂(활성과 따로), 활성은 고리,
// 날짜는 거래일 판으로만(앞뒤 버튼 없음), 시각 미정은 15:30, 종목은 이름.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import { usePaths } from "../store/paths.js";
import { useHistory } from "../store/history.js";
import { PathBar } from "./PathBar.js";

// 2026-07-31(금) 다음 거래일은 08-03(월) — 주말 08-01·02 는 목록에 없다.
const DAYS = ["2026-06-30", "2026-07-30", "2026-07-31", "2026-08-03"];

function renderBar(tradingDays: () => Promise<string[]> = async () => DAYS) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({
        tradingDays,
        stockMaster: async () => [{ stockCode: "402340", name: "SK스퀘어", market: "KOSPI" }],
    });
    return render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <PathBar />
            </MarketProvider>
        </QueryClientProvider>,
    );
}

const s = (id: string) => usePaths.getState().paths.find((p) => p.id === id)!.s;
const dateButton = () => screen.getByTitle("날짜 고르기 (거래일)");

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    useHistory.setState({ visits: [] });
    usePaths.getState().write("B", { code: "009150", date: "2026-07-30" });
    usePaths.getState().write("A", { code: "402340", date: "2026-07-31", time: "10:00" }); // A 가 활성
});
afterEach(cleanup);

describe("PathBar", () => {
    it("입력칸·앞뒤 버튼이 없다 · ▸/◂ 는 펼침/접음만(활성은 그대로, .hover-reveal) · 이름표·빈 곳을 누르면 활성", async () => {
        renderBar();
        expect(screen.queryAllByRole("textbox")).toHaveLength(0);
        expect(screen.queryByText("‹")).toBeNull();
        expect(screen.queryByText("›")).toBeNull();
        expect(await screen.findByText("SK스퀘어")).toBeTruthy();
        expect(screen.getAllByTitle("날짜 고르기 (거래일)")).toHaveLength(1); // A 만 펼침(기본)
        const foldB = screen.getByTitle("경로 B 펼치기");
        expect(foldB.className).toBe("hover-reveal");
        expect(foldB.closest(".hover-host")).toBe(document.querySelector('[data-path-card="B"]'));
        fireEvent.click(foldB);
        expect(usePaths.getState().active).toBe("A");
        expect(screen.getAllByTitle("날짜 고르기 (거래일)")).toHaveLength(2);
        fireEvent.click(document.querySelector('[data-path-card="B"]')!); // 빈 곳
        expect(usePaths.getState().active).toBe("B");
        fireEvent.click(screen.getByTitle(/^경로 A — 누르면 활성 · 2026-07-31 \(금\) · 10:00 · SK스퀘어 · 우클릭/)); // 이름표
        expect(usePaths.getState().active).toBe("A");
        fireEvent.click(screen.getByTitle("경로 A 접기"));
        expect(usePaths.getState().paths.find((p) => p.id === "A")!.open).toBe(false);
        expect(usePaths.getState().active).toBe("A");
        await waitFor(() => expect(dateButton().textContent).toContain("2026-07-30"));
    });

    it("날짜 판을 열어 둘러보기만 하면 활성은 그대로 — 날짜를 고르면 그 경로가 활성", async () => {
        usePaths.getState().toggleOpen("B"); // B 펼침, 활성은 A
        renderBar();
        const bDate = () => within(document.querySelector('[data-path-card="B"]') as HTMLElement).getByTitle("날짜 고르기 (거래일)");
        fireEvent.click(bDate());
        fireEvent.click(await screen.findByTitle("6월")); // 판 안 둘러보기(portal → React 트리로 카드까지 올라온다)
        fireEvent.click(screen.getByTitle("7월"));
        expect(usePaths.getState().active).toBe("A");
        fireEvent.click(screen.getByTitle("2026-07-31"));
        expect(usePaths.getState().active).toBe("B");
        expect(s("B").date).toBe("2026-07-31");
    });

    it("활성 경로는 경로 색 고리 — 접혀 있어도", () => {
        usePaths.getState().toggleOpen("A"); // A 접음(활성은 A)
        renderBar();
        const badgeA = screen.getByTitle(/^경로 A \(활성\) · .* · 우클릭/);
        expect((badgeA.parentElement as HTMLElement).style.boxShadow).toContain("0 0 0 1px");
        expect(screen.getByTitle(/^경로 B — 누르면 활성/).parentElement!.style.boxShadow).toBe("none");
    });

    it("우클릭 판 — 기본 메뉴는 막고, 접힌 이름표에서도 열린다 · 다른 경로를 통째로 가져오면 이 경로가 활성", async () => {
        renderBar();
        const card = (id: string) => document.querySelector(`[data-path-card="${id}"]`)!;
        expect(fireEvent.contextMenu(card("B"))).toBe(false); // 접힌 B — 브라우저 기본 메뉴는 막는다
        fireEvent.click(await screen.findByTitle("경로 A 의 날짜·시각·종목을 경로 B 로"));
        expect(s("B")).toEqual(s("A"));
        expect(usePaths.getState().active).toBe("B"); // 비활성이던 B 가 활성
        expect(screen.queryByText("다른 경로 가져오기")).toBeNull(); // 닫혔다
    });

    it("우클릭 판이 열린 채 이름표·접기 버튼을 누르면 판은 닫히고 그 버튼은 제 일을 한다 · 접힌 이름표 = 활성", async () => {
        renderBar();
        const card = (id: string) => document.querySelector(`[data-path-card="${id}"]`)!;
        fireEvent.contextMenu(card("A"));
        expect(await screen.findByText("다른 경로 가져오기")).toBeTruthy();
        const badgeB = screen.getByTitle(/^경로 B — 누르면 활성/); // 접힌 B 의 이름표
        fireEvent.mouseDown(badgeB);
        fireEvent.click(badgeB);
        expect(screen.queryByText("다른 경로 가져오기")).toBeNull();
        expect(usePaths.getState().active).toBe("B");
        fireEvent.contextMenu(card("A"));
        expect(await screen.findByText("다른 경로 가져오기")).toBeTruthy();
        const foldA = screen.getByTitle("경로 A 접기");
        fireEvent.mouseDown(foldA);
        fireEvent.click(foldA);
        expect(screen.queryByText("다른 경로 가져오기")).toBeNull();
        expect(usePaths.getState().paths.find((p) => p.id === "A")!.open).toBe(false);
        expect(usePaths.getState().active).toBe("B");
    });

    it("우클릭 판이 열린 채 카드를 왼쪽으로 누르면 닫힌다 · 날짜 판과 겹쳐 뜨지 않는다", async () => {
        renderBar();
        const cardA = document.querySelector('[data-path-card="A"]')!;
        fireEvent.contextMenu(cardA);
        expect(await screen.findByText("다른 경로 가져오기")).toBeTruthy();
        fireEvent.mouseDown(dateButton());
        fireEvent.click(dateButton()); // 날짜 판을 연다 — 우클릭 판은 닫힌다
        expect(screen.queryByText("다른 경로 가져오기")).toBeNull();
        expect(await screen.findByTitle("2026-07-31")).toBeTruthy();
        // 날짜 판 안 우클릭은 우클릭 판을 열지 않는다
        fireEvent.contextMenu(screen.getByTitle("2026-07-31"));
        expect(screen.queryByText("다른 경로 가져오기")).toBeNull();
        // 날짜 판이 열린 채 카드를 우클릭하면 날짜 판은 닫히고 우클릭 판만
        fireEvent.contextMenu(cardA);
        expect(await screen.findByText("다른 경로 가져오기")).toBeTruthy();
        expect(screen.queryByTitle("2026-07-31")).toBeNull();
    });

    it("우클릭 판의 기록 — 누르면 그 종목·날짜(마지막 시각)로, 순서는 그대로 · × 는 그 줄만 지운다", async () => {
        useHistory.setState({ visits: [
            { code: "009150", date: "2026-07-30", time: "09:44", at: 2 },
            { code: "402340", date: "2026-07-31", time: "10:00", at: 1 },
        ] });
        usePaths.getState().write("B", { code: "402340", date: "2026-07-31", time: "10:00" });
        usePaths.getState().setActive("A"); // B 는 비활성·접힘
        renderBar();
        fireEvent.contextMenu(document.querySelector('[data-path-card="B"]')!);
        const rows = await screen.findAllByTitle("경로 B 를 이 종목·날짜로");
        expect(rows).toHaveLength(2);
        expect(rows[1].hasAttribute("data-selected")).toBe(true); // 지금 B 가 보는 종목·날짜
        fireEvent.click(rows[0]);
        expect(s("B")).toEqual({ code: "009150", date: "2026-07-30", time: "09:44" });
        expect(usePaths.getState().active).toBe("B");
        expect(useHistory.getState().visits.map((v) => v.code)).toEqual(["009150", "402340"]);
        // × — 그 줄만 지우고, 줄 누르기(되돌리기)로 새지 않는다(판도 그대로)
        fireEvent.contextMenu(document.querySelector('[data-path-card="B"]')!);
        fireEvent.click((await screen.findAllByTitle("이 기록 지우기"))[1]);
        expect(useHistory.getState().visits.map((v) => v.code)).toEqual(["009150"]);
        expect(s("B")).toEqual({ code: "009150", date: "2026-07-30", time: "09:44" });
        expect(screen.getByText("다른 경로 가져오기")).toBeTruthy();
    });

    it("경로가 많아도 줄바꿈하지 않는다 — 경로 영역은 가로 스크롤, ⚙ 는 그 밖 고정 자리", () => {
        for (let i = 0; i < 6; i++) usePaths.getState().addPath();
        renderBar();
        const row = document.querySelector("[data-path-row]") as HTMLElement;
        expect(row.style.flexWrap).toBe("nowrap");
        expect(row.style.overflowX).toBe("auto");
        expect(row.querySelectorAll("[data-path-card]")).toHaveLength(8);
        const gear = screen.getByRole("button", { name: "설정" });
        expect(row.contains(gear)).toBe(false);
        expect(gear.style.flexShrink).toBe("0");
    });

    it("시각 미정은 15:30 으로 보인다", () => {
        usePaths.getState().write("A", { time: "" });
        renderBar();
        expect(screen.getByText("15:30")).toBeTruthy();
    });

    it("날짜 판 — 거래일만 누를 수 있고, 고르면 닫히며 시각은 그대로", async () => {
        renderBar();
        fireEvent.click(dateButton());
        const day = (iso: string) => screen.getByTitle(iso) as HTMLButtonElement;
        await waitFor(() => expect(day("2026-07-30").disabled).toBe(false));
        expect(day("2026-07-29").disabled).toBe(true); // 거래일 목록에 없는 날
        // 8월로 — 주말은 못 누르고, 08-03 을 고른다
        fireEvent.click(screen.getByTitle("8월"));
        expect(day("2026-08-01").disabled).toBe(true);
        fireEvent.click(day("2026-08-03"));
        expect(s("A").date).toBe("2026-08-03");
        expect(s("A").time).toBe("10:00");
        expect(screen.queryByTitle("2026-08-03")).toBeNull(); // 판이 닫혔다
    });

    it("날짜가 없을 때 판을 열어 둔 채 목록이 늦게 오면 — 안내 뒤 최신 거래일의 달이 열린다", async () => {
        usePaths.getState().write("A", { date: "" });
        let arrive!: (d: string[]) => void;
        renderBar(() => new Promise((r) => (arrive = r)));
        fireEvent.click(dateButton());
        expect(screen.getByText("거래일 목록 없음")).toBeTruthy();
        arrive(DAYS);
        expect(await screen.findByText("2026년 8월")).toBeTruthy();
        expect((screen.getByTitle("2026-08-03") as HTMLButtonElement).disabled).toBe(false);
    });
});
