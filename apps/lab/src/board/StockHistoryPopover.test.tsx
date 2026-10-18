// 종목 이력 창 — 가짜 창구를 주입해 "열기 → asOf 전달 → 최근순 목록 → 검색 필터 → 404 안내"를 확인한다.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../market/http.js";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import type { StockMoves } from "../market/types.js";
import { StockHistoryPopover } from "./StockHistoryPopover.js";

const MOVES: StockMoves = {
    code: "000001",
    name: "알파",
    from: "2023-01-02",
    to: "2026-10-17",
    issues: [
        { date: "2025-01-02", themes: ["이차전지"], issue: "수주 공시", evidence: [{ src: "tg", date: "2025-01-02", time: "09:10", title: "알파 수주 기사", ref: "p#1" }] },
        { date: "2025-03-04", themes: ["로봇"], issue: "신제품 발표", evidence: [{ src: "tg", date: "2025-03-04", time: "10:00", title: "로봇 신제품 공개", ref: "p#2" }] },
    ],
};

function renderPopover(stub: (code: string, asOf?: string) => Promise<StockMoves>, asOf?: string, calls: Array<{ code: string; asOf?: string }> = []) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({
        stockMoves: (code: string, asOf?: string) => {
            calls.push({ code, asOf });
            return stub(code, asOf);
        },
        stockMaster: async () => [],
    });
    render(
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>
                <StockHistoryPopover code="000001" asOf={asOf} at={{ x: 10, y: 10 }} onClose={() => undefined} />
            </MarketProvider>
        </QueryClientProvider>,
    );
    return calls;
}

afterEach(cleanup);

describe("StockHistoryPopover", () => {
    it("asOf 를 창구로 전달하고, 이력을 최근 날짜부터 그린다", async () => {
        const calls = renderPopover(async () => MOVES, "2025-06-01");
        await waitFor(() => expect(screen.getByText("수주 공시")).toBeTruthy());
        expect(calls).toEqual([{ code: "000001", asOf: "2025-06-01" }]);
        expect(screen.getByText("알파")).toBeTruthy();
        // 서버는 오름차순 — 화면은 최근(2025-03-04)이 먼저.
        const body = document.querySelector("[data-popover-layer]")!.textContent!;
        expect(body.indexOf("신제품 발표")).toBeLessThan(body.indexOf("수주 공시"));
        // 근거는 제목·ref 표시(링크 아님).
        expect(screen.getByText("알파 수주 기사")).toBeTruthy();
        expect(screen.getByText("p#1")).toBeTruthy();
        expect(document.querySelector("[data-popover-layer] a")).toBeNull();
    });

    it("검색 — 이유·테마·근거 제목을 부분 문자열로 거른다(클라에서만)", async () => {
        renderPopover(async () => MOVES);
        await waitFor(() => expect(screen.getByText("수주 공시")).toBeTruthy());
        const input = screen.getByPlaceholderText(/이력 검색/);
        fireEvent.change(input, { target: { value: "로봇" } }); // 테마·근거 제목에만 있다
        expect(screen.queryByText("수주 공시")).toBeNull();
        expect(screen.getByText("신제품 발표")).toBeTruthy();
        fireEvent.change(input, { target: { value: "수주 공" } }); // 이유 부분 문자열
        expect(screen.getByText("수주 공시")).toBeTruthy();
        expect(screen.queryByText("신제품 발표")).toBeNull();
        fireEvent.change(input, { target: { value: "없는말" } });
        expect(screen.getByText(/검색과 맞는 이력 없음/)).toBeTruthy();
    });

    it("404(이력 없는 종목) = 안내, 404(없는 경로 — 옛 lab-api 배선) = 오류로 가른다", async () => {
        renderPopover(() => Promise.reject(new ApiError("이력 없는 종목: 000001", 404, '{"error":"이력 없는 종목: 000001"}')));
        await waitFor(() => expect(screen.getByText(/이력 없음 — 움직인 날 기록에 없는 종목/)).toBeTruthy());
        expect(screen.queryByText(/이력 오류/)).toBeNull();
        cleanup();
        renderPopover(() => Promise.reject(new ApiError("GET /api/theme/stocks/000001 404", 404, '{"error":"없는 경로: /theme/stocks/000001"}')));
        await waitFor(() => expect(screen.getByText(/이력 오류/)).toBeTruthy());
    });

    it("404 아닌 오류(500) = 이력 오류 표시", async () => {
        renderPopover(() => Promise.reject(new ApiError("Internal server error", 500, "")));
        // useStockMoves 는 404 외엔 1회 재시도한다 — 재시도가 끝나야 오류가 뜬다.
        await waitFor(() => expect(screen.getByText(/이력 오류: Internal server error/)).toBeTruthy(), { timeout: 4000 });
    });

    it("asOf 가 기록 범위 앞 = 「아직 모른다」, 범위 안 빈 결과 = 「움직인 날 없음」", async () => {
        renderPopover(async () => ({ ...MOVES, issues: [] }), "2022-11-30");
        await waitFor(() => expect(screen.getByText(/기록 범위\(2023-01-02~\) 이전 — 아직 모른다/)).toBeTruthy());
        cleanup();
        renderPopover(async () => ({ ...MOVES, issues: [] }), "2024-06-30");
        await waitFor(() => expect(screen.getByText(/2024-06-30 까지 움직인 날 없음\(기록 2023-01-02~\)/)).toBeTruthy());
        cleanup();
        // 범위 뒤도 "없음" 단정 금지 — to 뒤는 아직 훑지 않았다.
        renderPopover(async () => ({ ...MOVES, issues: [] }), "2026-10-18");
        await waitFor(() => expect(screen.getByText(/기록\(2023-01-02~2026-10-17\) 안 움직인 날 없음 — 그 뒤는 아직 모른다/)).toBeTruthy());
    });
});
