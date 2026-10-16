import { afterEach, describe, expect, it, vi } from "vitest";
import { judgmentServer } from "./server.js";
import type { StockHistory } from "./types.js";

const DATE = "2026-07-31";

const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch(res: Response) {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => res);
    vi.stubGlobal("fetch", f);
    return f;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("judgmentServer.historyThemes", () => {
    it("날짜로 GET 하고 종목 → 테마 맵으로", async () => {
        const f = stubFetch(json(200, { date: DATE, stocks: { "000660": ["반도체", "HBM"] }, coverage: { from: "2023-02-14", to: "2026-10-14" } }));
        const h = await judgmentServer.historyThemes(DATE);
        expect(f.mock.calls[0]![0]).toBe(`/judgment/history/themes?date=${DATE}`);
        expect([...h.themes]).toEqual([["000660", ["반도체", "HBM"]]]);
        expect(h.coverage).toEqual({ from: "2023-02-14", to: "2026-10-14" });
    });

    it("오류는 서버 error 칸을 메시지로 · stocks 가 없으면 던진다", async () => {
        stubFetch(json(503, { error: "판단 저장소가 없다: C:/x" }));
        await expect(judgmentServer.historyThemes(DATE)).rejects.toThrow("판단 저장소가 없다: C:/x");
        stubFetch(json(200, {}));
        await expect(judgmentServer.historyThemes(DATE)).rejects.toThrow("stocks");
    });
});

describe("judgmentServer.stockHistory", () => {
    it("코드 · 날짜로 GET · 404 면 null", async () => {
        const h: StockHistory = { code: "000660", name: "SK하이닉스", asOf: DATE, closing: null, themes: [], lines: [], coverage: null };
        const f = stubFetch(json(200, h));
        expect(await judgmentServer.stockHistory("000660", DATE)).toEqual(h);
        expect(f.mock.calls[0]![0]).toBe(`/judgment/history/stocks/000660?date=${DATE}`);
        stubFetch(json(404, { error: "이력이 없다" }));
        expect(await judgmentServer.stockHistory("000660", DATE)).toBeNull();
    });
});
