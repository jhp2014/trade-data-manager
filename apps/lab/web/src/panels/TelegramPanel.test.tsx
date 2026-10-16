// 텔레그램 패널 — 가짜 창구로 "아카이브를 경로 날짜대로 저절로 읽고, 검색어로 거르고, 한 주씩 거슬러 간다"를 확인한다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import type { TelegramArchivePage, TelegramNewsItem } from "../market/types.js";
import { usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { Framed, headerLine, openControls, resetHeaderLedger } from "../test/framed.js";
import { TelegramPanel } from "./TelegramPanel.js";

const DATE = "2026-07-31";
const PANEL = "telegram-1";

type Args = { from: string; to: string; q?: string; before?: string };
const at = (date: string, hm: string): string => new Date(`${date}T${hm}:00+09:00`).toISOString();
const item = (ref: string, date: string, hm: string, text = `${ref} 알파 소식`): TelegramNewsItem => ({ channel: "주식방", at: at(date, hm), text, ref, url: `https://t.me/x/${ref}` });
/** 수집 범위 — 07-20 09:00 ~ 08-14 16:29(KST). */
const COV = { from: at("2026-07-20", "09:00"), to: at("2026-08-14", "16:29") };
const page = (items: TelegramNewsItem[], extra: Partial<TelegramArchivePage> = {}): TelegramArchivePage => ({ items, coverage: COV, ...extra });

function setup(respond: (a: Args) => Promise<TelegramArchivePage> = async (a) => page(a.from === DATE ? [item("m1", DATE, "09:30")] : [])) {
    const calls: Args[] = [];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({
        stockMaster: async () => [
            { stockCode: "000001", name: "알파", market: "KOSPI" },
            { stockCode: "000002", name: "베타", market: "KOSPI" },
        ],
        telegramArchive: (a: Args) => {
            calls.push({ ...a });
            return respond(a);
        },
    });
    const ui = () => (
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <Framed panelId={PANEL}>
                    <TelegramPanel panelId={PANEL} />
                </Framed>
            </MarketProvider>
        </QueryClientProvider>
    );
    let r = render(ui());
    /** 탭을 옮겼다 돌아온 것처럼 패널을 내렸다가 다시 붙인다. */
    const remount = (): void => {
        r.unmount();
        r = render(ui());
    };
    return { calls, remount };
}

const input = () => screen.getByPlaceholderText("검색어 — 비우면 전체") as HTMLInputElement;
const searchBtn = () => screen.getByRole("button", { name: "검색" });
const writePath = (patch: Parameters<ReturnType<typeof usePaths.getState>["write"]>[1]) => act(() => usePaths.getState().write("A", patch));
const searchFor = (q: string) => {
    fireEvent.change(input(), { target: { value: q } });
    fireEvent.click(searchBtn());
};

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    resetHeaderLedger();
    usePaths.getState().bind(PANEL, "A");
    usePaths.getState().write("A", { code: "000001", date: DATE });
});
afterEach(cleanup);

describe("TelegramPanel — 경로 날짜를 따라 저절로", () => {
    it("그날 전체를 읽고(검색어 없음), 날짜를 바꾸면 그 날짜로 다시 읽는다", async () => {
        const { calls } = setup();
        expect(await screen.findByText("주식방")).toBeTruthy();
        expect(calls[0]).toEqual({ from: DATE, to: DATE });
        writePath({ date: "2026-08-03" });
        await waitFor(() => expect(calls.at(-1)).toEqual({ from: "2026-08-03", to: "2026-08-03" }));
    });

    it("날짜가 없으면 부르지 않는다", async () => {
        usePaths.getState().write("A", { date: "" });
        const { calls } = setup();
        expect(await screen.findByText(/에 날짜를 넣으세요/)).toBeTruthy();
        expect(calls).toEqual([]);
    });

    it("헤더에 무엇을 보는지 — 검색어(없으면 전체) · 날짜 · 건수", async () => {
        setup();
        await screen.findByText("주식방");
        await waitFor(() => expect(headerLine(PANEL)!.textContent).toContain(`전체 · ${DATE} (금) · 1건`));
    });
});

describe("TelegramPanel — 검색어로 거르기", () => {
    it("[검색] · Enter 로 확정하면 그 검색어로 다시 읽고 강조한다 — 비우면 전체", async () => {
        const { calls } = setup(async (a) => page([item("m1", DATE, "09:30", a.q ? `${a.q} 관련 소식` : "아무 소식")]));
        await screen.findByText("아무 소식");
        searchFor("  알파 ");
        await waitFor(() => expect(calls.at(-1)).toEqual({ from: DATE, to: DATE, q: "알파" }));
        expect(await screen.findByText("알파", { selector: "mark" })).toBeTruthy();
        expect(headerLine(PANEL)!.textContent).toContain(`"알파" · ${DATE} (금)`);
        fireEvent.change(input(), { target: { value: "" } });
        fireEvent.keyDown(input(), { key: "Enter" });
        // 전체는 처음에 이미 받았다 — 캐시로 돌아가고 다시 부르지 않는다
        expect(await screen.findByText("아무 소식")).toBeTruthy();
        expect(headerLine(PANEL)!.textContent).toContain(`전체 · ${DATE} (금)`);
        expect(calls).toHaveLength(2);
    });

    it("[종목명으로] 는 경로 종목 이름으로 걸러 읽는다", async () => {
        const { calls } = setup();
        await screen.findByText("주식방");
        openControls(PANEL);
        const fillBtn = () => screen.getAllByTitle(/"알파" 으로 걸러 보기/).find((el) => el.tagName === "BUTTON") as HTMLButtonElement;
        await waitFor(() => expect(fillBtn().disabled).toBe(false));
        fireEvent.click(fillBtn());
        await waitFor(() => expect(calls.at(-1)).toMatchObject({ q: "알파" }));
        // 판이 열려 있어 검색칸이 줄 · 판에 하나씩 — 둘 다 같은 글자
        expect(screen.getAllByPlaceholderText("검색어 — 비우면 전체").map((el) => (el as HTMLInputElement).value)).toEqual(["알파", "알파"]);
    });

    it("옛 설정(라이브 시절 확정 검색 { q, date })이 남아 있으면 그 검색어로 이어 간다", async () => {
        usePanelUiStore.getState().set(PANEL, "telegramSearch", { q: "베타", date: "2026-07-01" });
        const { calls } = setup();
        await waitFor(() => expect(calls[0]).toEqual({ from: DATE, to: DATE, q: "베타" }));
        expect(input().value).toBe("베타");
    });

    it("확정한 검색어 · 치는 중인 글자는 패널을 다시 붙여도 남는다", async () => {
        const { remount, calls } = setup();
        await screen.findByText("주식방");
        searchFor("알파");
        fireEvent.change(input(), { target: { value: "베타 치는 중" } });
        remount();
        expect(input().value).toBe("베타 치는 중");
        await waitFor(() => expect(calls.at(-1)).toMatchObject({ q: "알파" }));
    });
});

describe("TelegramPanel — 링크 미리보기에서 맞은 검색", () => {
    it("검색어가 본문엔 없고 미리보기에 있으면 그 글을 작게 보이고 강조한다 · 검색을 지우면 안 보인다", async () => {
        const pv = { ...item("m1", DATE, "09:30", "삼전닉스가 80% 부담"), preview: { title: "보조금 협상", description: "삼성전자와 SK하이닉스가 부담" } };
        setup(async () => page([pv]));
        await screen.findByText("삼전닉스가 80% 부담");
        expect(document.querySelector("[data-preview]")).toBeNull();
        searchFor("삼성전자");
        await waitFor(() => expect(document.querySelector("[data-preview]")).not.toBeNull());
        const box = document.querySelector("[data-preview]") as HTMLElement;
        expect(box.textContent).toContain("미리보기");
        expect(box.textContent).not.toContain("보조금 협상"); // 맞지 않은 칸은 안 보인다
        expect(within(box).getByText("삼성전자", { selector: "mark" })).toBeTruthy();
        fireEvent.change(input(), { target: { value: "" } });
        fireEvent.keyDown(input(), { key: "Enter" });
        await waitFor(() => expect(document.querySelector("[data-preview]")).toBeNull());
    });
});

describe("TelegramPanel — 더보기 = 바로 앞 한 주, 수집 범위에서 멈춤", () => {
    it("앞 한 주씩 거슬러 가고, 수집 시작(07-20)에 닿으면 더 가지 않는다", async () => {
        const { calls } = setup(async (a) => page(a.from === DATE ? [item("m1", DATE, "09:30")] : [item(`p-${a.to}`, a.to, "10:00")]));
        await screen.findByText("주식방");
        fireEvent.click(await screen.findByText(`더보기 (${DATE} 이전 한 주)`));
        await waitFor(() => expect(calls.at(-1)).toEqual({ from: "2026-07-24", to: "2026-07-30" }));
        fireEvent.click(await screen.findByText("더보기 (2026-07-24 이전 한 주)"));
        await waitFor(() => expect(calls.at(-1)).toEqual({ from: "2026-07-20", to: "2026-07-23" }));
        expect(await screen.findByText("빠짐없는 수집의 시작(2026-07-20 09:00)까지 봤습니다 — 그 앞은 일부 방만 있거나 수집 전")).toBeTruthy();
        expect(calls).toHaveLength(3);
    });

    it("한 구간이 limit 에 걸렸으면(nextBefore) 같은 구간을 이어 받는다", async () => {
        const { calls } = setup(async (a) => (a.before ? page([item("m2", DATE, "08:00")]) : page([item("m1", DATE, "09:30")], { nextBefore: "c1" })));
        await screen.findByText("m1 알파 소식");
        fireEvent.click(await screen.findByText(`더보기 (${DATE} 이어서)`));
        await waitFor(() => expect(calls.at(-1)).toEqual({ from: DATE, to: DATE, before: "c1" }));
        expect(await screen.findByText("m2 알파 소식")).toBeTruthy();
    });
});

describe("TelegramPanel — 수집 범위 밖은 '아직 모름'", () => {
    it("수집 시작 전 날짜면 헤더가 경고하고, 비어도 '메시지 없음'이라 하지 않는다", async () => {
        usePaths.getState().write("A", { date: "2026-07-10" });
        setup(async () => page([]));
        expect(await screen.findByText(/아직 수집 안 된 날짜라 비어 있을 수 있습니다/)).toBeTruthy();
        expect(headerLine(PANEL)!.textContent).toContain("수집 전 날짜 — 2026-07-20부터 빠짐없음");
        expect(screen.getByText("빠짐없는 수집 범위 앞이라 더 거슬러 가지 않습니다")).toBeTruthy();
    });

    it("수집 범위 앞이라도 메시지가 있으면 '일부 방만 수집된 날짜'(방마다 백필이 따로) · 검색어로 걸러 비었으면 모름", async () => {
        usePaths.getState().write("A", { date: "2026-07-10" });
        setup(async (a) => page(a.q ? [] : [item("o1", "2026-07-10", "09:30")]));
        await screen.findByText("주식방");
        expect(headerLine(PANEL)!.textContent).toContain("일부 방만 수집된 날짜 — 2026-07-20부터 빠짐없음");
        searchFor("없는말");
        await waitFor(() => expect(headerLine(PANEL)!.textContent).toContain("수집 전이거나 일부 방만 든 날짜"));
    });

    it("수집 끝 날은 마지막 수집 시각까지 — 헤더에 '16:29까지 빠짐없음'", async () => {
        usePaths.getState().write("A", { date: "2026-08-14" });
        setup(async () => page([item("t1", "2026-08-14", "11:00")]));
        await screen.findByText("주식방");
        await waitFor(() => expect(headerLine(PANEL)!.textContent).toContain("16:29까지 빠짐없음"));
    });

    it("수집 시작일은 그 시각부터만 — 비어도 '메시지 없음'이라 단정하지 않는다", async () => {
        usePaths.getState().write("A", { date: "2026-07-20" });
        setup(async () => page([]));
        expect(await screen.findByText("2026-07-20 메시지 없음 — 09:00부터 빠짐없음(그 앞은 일부 방만)")).toBeTruthy();
        expect(headerLine(PANEL)!.textContent).toContain("09:00부터 빠짐없음");
    });

    it("수집 범위를 모르면(null) 헤더 · 바닥 모두 그렇게 말한다", async () => {
        setup(async () => ({ items: [item("m1", DATE, "09:30")], coverage: null }));
        await screen.findByText("주식방");
        expect(headerLine(PANEL)!.textContent).toContain("수집 범위 모름");
        expect(screen.getByText("수집 범위를 몰라 더 거슬러 가지 않습니다")).toBeTruthy();
    });

    it("범위 안이면 아무 말 안 한다 · 비면 '메시지 없음'", async () => {
        setup(async () => page([]));
        expect(await screen.findByText(`${DATE} 메시지 없음`)).toBeTruthy();
        expect(headerLine(PANEL)!.textContent).not.toContain("수집");
    });
});

describe("TelegramPanel — 경로 시각 이후(사후 정보)", () => {
    const three = async () => page([item("a", DATE, "09:30"), item("b", DATE, "10:15"), item("c", DATE, "11:00")]);

    it("경로 시각보다 나중 메시지는 흐리게, 경계에 선 — 시각을 옮겨도 다시 부르지 않는다", async () => {
        usePaths.getState().write("A", { time: "10:00" });
        const { calls } = setup(three);
        await screen.findByText("a 알파 소식");
        const later = () => [...document.querySelectorAll("[data-later]")].map((e) => e.getAttribute("data-ref"));
        expect(later()).toEqual(["c", "b"]);
        expect(screen.getByText("▲ 경로 시각 10:00 이후")).toBeTruthy();
        writePath({ time: "10:30" });
        await waitFor(() => expect(later()).toEqual(["c"]));
        expect(calls).toHaveLength(1);
    });

    it("경로 시각이 바뀌면 경계로 스크롤한다(같은 시각엔 한 번)", async () => {
        const seen: string[] = [];
        const orig = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (this: Element) {
            seen.push(this.textContent ?? "");
        };
        try {
            usePaths.getState().write("A", { time: "10:00" });
            setup(three);
            await screen.findByText("a 알파 소식");
            await waitFor(() => expect(seen).toEqual(["▲ 경로 시각 10:00 이후"]));
            writePath({ time: "10:30" });
            await waitFor(() => expect(seen).toEqual(["▲ 경로 시각 10:00 이후", "▲ 경로 시각 10:30 이후"]));
        } finally {
            Element.prototype.scrollIntoView = orig;
        }
    });
});

describe("TelegramPanel — 그 밖", () => {
    it("긴 본문은 접혀 있고 펼칠 수 있다", async () => {
        setup(async () => page([item("long", DATE, "09:00", "가".repeat(400))]));
        const row = await screen.findByText("펼치기");
        fireEvent.click(row);
        expect(screen.getByText("접기")).toBeTruthy();
    });

    it("검색칸은 헤더 줄의 search 컨트롤 — [검색] 은 늘 보이는 버튼", async () => {
        setup();
        await screen.findByText("주식방");
        expect(within(headerLine(PANEL)!).getByPlaceholderText("검색어 — 비우면 전체")).toBeTruthy();
        expect(within(headerLine(PANEL)!).getByRole("button", { name: "검색" })).toBeTruthy();
    });

    it("실패는 그대로 보인다", async () => {
        setup(async () => {
            throw new Error("아카이브 꺼짐");
        });
        expect(await screen.findByText(/텔레그램 아카이브 오류: 아카이브 꺼짐/)).toBeTruthy();
    });
});
