// tdm 구현 — 텔레그램은 아카이브(tdm DB)만 부른다. 라이브 /news/telegram 은 부르지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tdmMarket } from "./tdm.js";

const page = { items: [], coverage: null };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const url = (i = 0): string => String(fetchMock.mock.calls[i][0]);

describe("telegramArchive", () => {
    it("하루면 date=, 구간이면 from=&to= — 검색어는 다듬어 싣고, 비면 뺀다", async () => {
        await tdmMarket.telegramArchive({ from: "2026-07-31", to: "2026-07-31", q: " SK스퀘어 " });
        await tdmMarket.telegramArchive({ from: "2026-07-24", to: "2026-07-30", q: " ", before: "c1" });
        expect(url(0)).toBe("/api/news/telegram/archive?date=2026-07-31&q=SK%EC%8A%A4%ED%80%98%EC%96%B4");
        expect(url(1)).toBe("/api/news/telegram/archive?from=2026-07-24&to=2026-07-30&before=c1");
    });
    it("라이브 검색 경로(/news/telegram?)는 부르지 않는다 — 같은 걸 다시 불러도 그대로 다시 부른다(DB 라 제한 없음)", async () => {
        await tdmMarket.telegramArchive({ from: "2026-07-31", to: "2026-07-31" });
        await tdmMarket.telegramArchive({ from: "2026-07-31", to: "2026-07-31" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.every((c) => String(c[0]).startsWith("/api/news/telegram/archive?"))).toBe(true);
    });
});
