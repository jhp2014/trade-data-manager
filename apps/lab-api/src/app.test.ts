// 경로 · 상태 코드를 본다(계산은 market/* 테스트). Hono 라 서버 없이 app.request 로 부른다.
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

type Ports = Partial<Parameters<typeof createApp>[0]>;
function make(ports: Ports = {}) {
    const app = createApp({
        listDates: async () => [],
        listStockMeta: async () => [],
        telegramArchive: { searchPage: async () => ({ items: [] }), coverage: async () => null },
        chartByCode: () => Promise.reject(new Error("스텁 없음")),
        stockNews: { getHeadlines: async () => [], feedHeadlines: async () => [] },
        dayFlowBody: async (date) => JSON.stringify({ date, stocks: [] }),
        theme: null,
        ...ports,
    });
    return async (path: string, method = "GET") => {
        const res = await app.request(path, { method });
        return { status: res.status, headers: res.headers, json: (await res.json()) as unknown };
    };
}

it("없는 경로는 404 · GET 외는 405(읽기 전용)", async () => {
    const call = make();
    const r = await call("/judgment/history/themes?date=2025-01-02"); // 은퇴한 경로도 그냥 404
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "없는 경로: /judgment/history/themes" });
    const post = await call("/dates", "POST"); // 있는 경로여도 쓰기는 막는다 — lab-api 는 읽기만
    expect(post.status).toBe(405);
    expect(post.json).toEqual({ error: "GET 만 받는다" });
});

describe("dates", () => {
    it("주입된 listDates 를 그대로 배열로 — no-store 없음", async () => {
        const call = make({ listDates: async () => ["2025-01-02", "2025-01-03"] });
        const r = await call("/dates");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(["2025-01-02", "2025-01-03"]);
        expect(r.headers.get("cache-control")).toBeNull();
    });
    it("listDates 실패 = NestJS 꼴 500 + onError — 빈 배열로 삼키지 않는다", async () => {
        const seen: unknown[] = [];
        const call = make({ listDates: () => Promise.reject(new Error("DB down")), onError: (e) => seen.push(e) });
        const r = await call("/dates");
        expect(r.status).toBe(500);
        expect(r.json).toEqual({ statusCode: 500, message: "Internal server error" });
        expect(seen).toHaveLength(1);
    });
});

describe("stocks/master", () => {
    it("주입된 listStockMeta 를 그대로 배열로", async () => {
        const meta = [{ stockCode: "000001", name: "알파", market: "거래소" }];
        const call = make({ listStockMeta: async () => meta });
        const r = await call("/stocks/master");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(meta);
    });
});

describe("chart", () => {
    it("code·date 검증 통과 시 주입된 chartByCode 결과를 그대로", async () => {
        const bundle = { stockCode: "000001", daily: [], minutes: [], basePrice: null };
        const call = make({ chartByCode: async (code, date) => ({ ...bundle, stockCode: `${code}@${date}` }) });
        const r = await call("/chart?code=000001&date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ ...bundle, stockCode: "000001@2025-01-02" });
    });
    it("code 없음·date 불량 = 400, NestJS 와 같은 body", async () => {
        const call = make();
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
        const call = make();
        const r = await call("/day-flow?date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toContain("application/json");
        expect(r.json).toEqual({ date: "2025-01-02", stocks: [] });
        const bad = await call("/day-flow");
        expect(bad.status).toBe(400);
        expect(bad.json).toEqual({ message: "date 필수(YYYY-MM-DD)", error: "Bad Request", statusCode: 400 });
    });
});

describe("theme", () => {
    const issue = (date: string) => ({
        date,
        themes: ["이차전지"],
        issue: `${date} 사유`,
        evidence: [{ src: "tg", date, time: "09:00", title: "제목", ref: "p#1" }],
    });
    const moves = { code: "000001", name: "알파", from: "2023-01-02", to: "2026-10-17", issues: [issue("2025-01-02"), issue("2025-01-03"), issue("2025-02-03")] };
    const store = {
        keywords: [{ theme: "이차전지", kind: "standing" as const, aliases: ["2차전지"] }],
        movesByCode: new Map([["000001", moves]]),
    };

    it("registry — 주입된 keywords 를 그대로 배열로", async () => {
        const call = make({ theme: store });
        const r = await call("/theme/registry");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(store.keywords);
    });
    it("stocks/:code — 전체, asOf 는 date <= asOf(당일 포함)로 서버가 자른다", async () => {
        const call = make({ theme: store });
        const all = await call("/theme/stocks/000001");
        expect(all.status).toBe(200);
        expect(all.json).toEqual(moves);
        const cut = await call("/theme/stocks/000001?asOf=2025-01-03");
        expect(cut.json).toEqual({ ...moves, issues: [issue("2025-01-02"), issue("2025-01-03")] });
    });
    it("stocks/:code — 이력 없는 종목은 빈 issues 가 아니라 404", async () => {
        const call = make({ theme: store });
        const r = await call("/theme/stocks/999999");
        expect(r.status).toBe(404);
        expect(r.json).toEqual({ error: "이력 없는 종목: 999999" });
    });
    it("stocks/:code — code 형식·asOf 불량은 400", async () => {
        const call = make({ theme: store });
        const badCode = await call("/theme/stocks/5930");
        expect(badCode.status).toBe(400);
        expect(badCode.json).toEqual({ message: "code 형식(6자리 영숫자): 5930", error: "Bad Request", statusCode: 400 });
        const badAsOf = await call("/theme/stocks/000001?asOf=2025-02-30");
        expect(badAsOf.status).toBe(400);
        expect(badAsOf.json).toEqual({ message: "asOf 가 유효한 날짜가 아님: 2025-02-30", error: "Bad Request", statusCode: 400 });
    });
    it("저장소 미적재(theme=null) = NestJS 꼴 500 + onError — market DB 미설정과 같은 결", async () => {
        const seen: unknown[] = [];
        const call = make({ onError: (e) => seen.push(e) }); // 기본 theme: null
        for (const path of ["/theme/registry", "/theme/stocks/000001"]) {
            const r = await call(path);
            expect(r.status).toBe(500);
            expect(r.json).toEqual({ statusCode: 500, message: "Internal server error" });
        }
        expect(seen).toHaveLength(2);
        expect((seen[0] as Error).message).toContain("TDM_AI_DIR");
    });
});

describe("news/hts", () => {
    const h = { srno: "7", date: "2025-01-02", time: "090000", title: "제목", sourceName: "HTS", categoryCode: "01", sourceCode: "x", stockCodes: [] };
    const wire = { srno: "7", date: "2025-01-02", time: "090000", title: "제목", sourceName: "HTS", categoryCode: "01" };
    it("종목+무키워드 = 그 날 전체를 내림차순으로 — wire 꼴(sourceCode·stockCodes 탈락)", async () => {
        const call = make({ stockNews: { getHeadlines: async () => [h, { ...h, srno: "8" }], feedHeadlines: async () => [] } });
        const r = await call("/news/hts?code=000001&date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual([{ ...wire, srno: "8" }, wire]);
    });
    it("커서 페이징 — feedHeadlines(before)로 그대로, beforeSrno 불량·누락은 400", async () => {
        const seen: unknown[] = [];
        const call = make({
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
        const seen: unknown[] = [];
        const call = make({
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
        const call = make({
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
        const call = make({
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
        const seen: Array<{ limit: number }> = [];
        const call = make({
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
