// 경로 · 상태 코드를 본다(계산은 judgment/history.test). Hono 라 서버 없이 app.request 로 부른다.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

let root: string;
let close: () => void;
let call: (path: string, method?: string) => Promise<{ status: number; headers: Headers; json: Record<string, unknown> }>;

type Ports = Partial<
    Pick<
        Parameters<typeof createApp>[0],
        "listDates" | "listStockMeta" | "telegramArchive" | "chartByCode" | "stockNews" | "dayFlowBody" | "onError"
    >
>;
function make(r: string, ports: Ports = {}): void {
    const made = createApp({
        judgmentRoot: r,
        listDates: async () => [],
        listStockMeta: async () => [],
        telegramArchive: { searchPage: async () => ({ items: [] }), coverage: async () => null },
        chartByCode: () => Promise.reject(new Error("스텁 없음")),
        stockNews: { getHeadlines: async () => [], feedHeadlines: async () => [] },
        dayFlowBody: async (date) => JSON.stringify({ date, stocks: [] }),
        ...ports,
    });
    close = made.close;
    call = async (path, method = "GET") => {
        const res = await made.app.request(path, { method });
        return { status: res.status, headers: res.headers, json: (await res.json()) as Record<string, unknown> };
    };
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "judgment-app-"));
    await mkdir(join(root, "이력-awake"), { recursive: true });
    await mkdir(join(root, "관점"), { recursive: true });
    await writeFile(join(root, "관점", "테마 사전.md"), "| 테마 | 이력 이름 | 상위 |\n|---|---|---|\n| 반도체 | HBM | |\n");
    const rows = [
        { v: 1, kind: "stock", id: "stock", code: "000001", name: "알파" },
        { v: 1, kind: "issue", id: "2025-01-02", date: "2025-01-02", themes: ["HBM"], issue: "x", high: null, evidence: [{ src: "cafe", title: "1. HBM", pct: 5 }] },
    ];
    await writeFile(join(root, "이력-awake", "000001.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    make(root);
});
afterEach(async () => {
    close();
    await rm(root, { recursive: true, force: true });
});

describe("history", () => {
    it("themes · stocks 200 (+no-store)", async () => {
        const t = await call("/judgment/history/themes?date=2025-02-01");
        expect(t.status).toBe(200);
        expect(t.json).toEqual({ date: "2025-02-01", stocks: { "000001": ["반도체"] }, coverage: null });
        expect(t.headers.get("cache-control")).toBe("no-store");
        const s = await call("/judgment/history/stocks/000001?date=2025-02-01");
        expect(s.status).toBe(200);
        expect(s.json).toMatchObject({ code: "000001", name: "알파", asOf: "2025-02-01", closing: null });
    });
    it("날짜 형식 400 · 이력 없음 404 · GET 아님 405 · 없는 경로 404", async () => {
        expect((await call("/judgment/history/themes")).status).toBe(400);
        expect((await call("/judgment/history/stocks/999999?date=2025-02-01")).status).toBe(404);
        expect((await call("/judgment/history/themes?date=2025-02-01", "POST")).status).toBe(405);
        expect((await call("/judgment/cases/x/2025-02-01")).status).toBe(404);
    });
    it("판단 저장소가 없으면 503 (+no-store)", async () => {
        close();
        make(join(root, "없음"));
        const r = await call("/judgment/history/themes?date=2025-02-01");
        expect(r.status).toBe(503);
        expect(r.headers.get("cache-control")).toBe("no-store");
    });
});

describe("dates", () => {
    it("주입된 listDates 를 그대로 배열로 — no-store 는 /judgment 전용이라 없음", async () => {
        close();
        make(root, { listDates: async () => ["2025-01-02", "2025-01-03"] });
        const r = await call("/dates");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(["2025-01-02", "2025-01-03"]);
        expect(r.headers.get("cache-control")).toBeNull();
    });
    it("listDates 실패 = NestJS 꼴 500 + onError — 빈 배열로 삼키지 않는다", async () => {
        close();
        const seen: unknown[] = [];
        make(root, { listDates: () => Promise.reject(new Error("DB down")), onError: (e) => seen.push(e) });
        const r = await call("/dates");
        expect(r.status).toBe(500);
        expect(r.json).toEqual({ statusCode: 500, message: "Internal server error" });
        expect(seen).toHaveLength(1);
    });
});

describe("stocks/master", () => {
    it("주입된 listStockMeta 를 그대로 배열로", async () => {
        close();
        const meta = [{ stockCode: "000001", name: "알파", market: "거래소" }];
        make(root, { listStockMeta: async () => meta });
        const r = await call("/stocks/master");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(meta);
    });
});

describe("chart", () => {
    it("code·date 검증 통과 시 주입된 chartByCode 결과를 그대로", async () => {
        close();
        const bundle = { stockCode: "000001", daily: [], minutes: [], basePrice: null };
        make(root, { chartByCode: async (code, date) => ({ ...bundle, stockCode: `${code}@${date}` }) });
        const r = await call("/chart?code=000001&date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ ...bundle, stockCode: "000001@2025-01-02" });
    });
    it("code 없음·date 불량 = 400, NestJS 와 같은 body", async () => {
        close();
        make(root);
        const noCode = await call("/chart?date=2025-01-02");
        expect(noCode.status).toBe(400);
        expect(noCode.json).toEqual({ message: "code 필수", error: "Bad Request", statusCode: 400 });
        const badDate = await call("/chart?code=000001&date=2025-02-30");
        expect(badDate.status).toBe(400);
        expect(badDate.json).toEqual({ message: "date 가 유효한 날짜가 아님: 2025-02-30", error: "Bad Request", statusCode: 400 });
    });
});

describe("day-flow", () => {
    it("date 검증 통과 시 주입된 dayFlowBody 문자열을 그대로(JSON content-type) — date 없으면 400", async () => {
        close();
        make(root, { dayFlowBody: async (date) => JSON.stringify({ date, stocks: [] }) });
        const r = await call("/day-flow?date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toContain("application/json");
        expect(r.json).toEqual({ date: "2025-01-02", stocks: [] });
        const bad = await call("/day-flow");
        expect(bad.status).toBe(400);
        expect(bad.json).toEqual({ message: "date 필수(YYYY-MM-DD)", error: "Bad Request", statusCode: 400 });
    });
});

describe("news/hts", () => {
    const h = { srno: "7", date: "2025-01-02", time: "090000", title: "제목", sourceName: "HTS", categoryCode: "01", sourceCode: "x", stockCodes: [] };
    const wire = { srno: "7", date: "2025-01-02", time: "090000", title: "제목", sourceName: "HTS", categoryCode: "01" };
    it("종목+무키워드 = 그 날 전체를 내림차순으로 — wire 꼴(sourceCode·stockCodes 탈락)", async () => {
        close();
        make(root, { stockNews: { getHeadlines: async () => [h, { ...h, srno: "8" }], feedHeadlines: async () => [] } });
        const r = await call("/news/hts?code=000001&date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual([{ ...wire, srno: "8" }, wire]);
    });
    it("커서 페이징 — feedHeadlines(before)로 그대로, beforeSrno 불량·누락은 400", async () => {
        close();
        const seen: unknown[] = [];
        make(root, {
            stockNews: {
                getHeadlines: async () => [],
                feedHeadlines: async (opts) => {
                    seen.push(opts);
                    return [h];
                },
            },
        });
        const r = await call("/news/hts?date=2025-01-03&beforeDate=2025-01-02&beforeSrno=7&limit=10");
        expect(r.status).toBe(200);
        expect(r.json).toEqual([wire]);
        expect(seen[0]).toMatchObject({ before: { publishedDate: "2025-01-02", srno: "7" }, limit: 10 });
        const bad = await call("/news/hts?date=2025-01-03&beforeDate=2025-01-02&beforeSrno=x7");
        expect(bad.status).toBe(400);
        expect(bad.json).toEqual({ message: "beforeSrno 형식(숫자)", error: "Bad Request", statusCode: 400 });
        expect((await call("/news/hts?date=2025-01-03&beforeDate=2025-01-02")).status).toBe(400);
    });
    it("초기 로드(전체 시황) = feedHeadlines(onOrBefore) — limit 불량은 30 폴백·상한 100, code 불량 400", async () => {
        close();
        const seen: unknown[] = [];
        make(root, {
            stockNews: {
                getHeadlines: async () => [],
                feedHeadlines: async (opts) => {
                    seen.push(opts);
                    return [];
                },
            },
        });
        await call("/news/hts?date=2025-01-03&limit=abc");
        expect(seen[0]).toMatchObject({ onOrBefore: "2025-01-03", limit: 30 });
        await call("/news/hts?date=2025-01-03&limit=250");
        expect(seen[1]).toMatchObject({ limit: 100 });
        const bad = await call("/news/hts?date=2025-01-03&code=5930");
        expect(bad.status).toBe(400);
        expect(bad.json).toEqual({ message: "code 형식(6자리 영숫자): 5930", error: "Bad Request", statusCode: 400 });
    });
});

describe("news/telegram/archive", () => {
    it("date 하루 — items 는 wire 꼴(at ISO), coverage ISO, nextBefore 있을 때만", async () => {
        close();
        make(root, {
            telegramArchive: {
                searchPage: async () => ({
                    items: [{ source: "telegram", channel: "방", at: new Date("2025-01-02T01:00:00Z"), text: "본문", ref: "p#1" }],
                    nextBefore: "2025-01-02T01:00:00.000Z#1",
                }),
                coverage: async () => ({ from: new Date("2024-01-01T00:00:00Z"), to: new Date("2025-02-01T00:00:00Z") }),
            },
        });
        const r = await call("/news/telegram/archive?date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual({
            items: [{ channel: "방", at: "2025-01-02T01:00:00.000Z", text: "본문", ref: "p#1" }],
            coverage: { from: "2024-01-01T00:00:00.000Z", to: "2025-02-01T00:00:00.000Z" },
            nextBefore: "2025-01-02T01:00:00.000Z#1",
        });
    });
    it("날짜 없음·잘못된 before = 400, NestJS 와 같은 body", async () => {
        close();
        make(root, {
            telegramArchive: {
                searchPage: () => Promise.reject(new Error("잘못된 before 커서: garbage")),
                coverage: async () => null,
            },
        });
        const missing = await call("/news/telegram/archive");
        expect(missing.status).toBe(400);
        expect(missing.json).toEqual({ message: "date= 또는 from=&to= 가 필요합니다", error: "Bad Request", statusCode: 400 });
        const badBefore = await call("/news/telegram/archive?date=2025-01-02&before=garbage");
        expect(badBefore.status).toBe(400);
        expect(badBefore.json).toEqual({ message: "잘못된 before 커서: garbage", error: "Bad Request", statusCode: 400 });
    });
    it("from>to·to 누락·limit 불량 = 400, limit 상한은 5000 으로 자름", async () => {
        close();
        const seen: Array<{ limit: number }> = [];
        make(root, {
            telegramArchive: {
                searchPage: async (_q, opts) => {
                    seen.push({ limit: opts.limit });
                    return { items: [] };
                },
                coverage: async () => null,
            },
        });
        expect((await call("/news/telegram/archive?from=2025-01-03&to=2025-01-02")).status).toBe(400);
        expect((await call("/news/telegram/archive?from=2025-01-02")).status).toBe(400);
        expect((await call("/news/telegram/archive?date=2025-01-02&limit=0")).status).toBe(400);
        expect((await call("/news/telegram/archive?date=2025-01-02&limit=1.5")).status).toBe(400);
        await call("/news/telegram/archive?date=2025-01-02&limit=99999");
        expect(seen[0]).toEqual({ limit: 5000 });
        await call("/news/telegram/archive?date=2025-01-02");
        expect(seen[1]).toEqual({ limit: 2000 });
    });
});
