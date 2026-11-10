// 경로 · 상태 코드를 본다(계산은 market/* 테스트). Hono 라 서버 없이 app.request 로 부른다.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { makeReplayDayReader } from "./replay/day.js";

type Ports = Partial<Parameters<typeof createApp>[0]>;
function make(ports: Ports = {}) {
    const app = createApp({
        listDates: async () => [],
        listStocks: async () => [],
        marketCapSeries: async () => [],
        telegramArchive: { searchPage: async () => ({ items: [] }), coverage: async () => null },
        dailyByCode: () => Promise.reject(new Error("스텁 없음")),
        minutesByDate: () => Promise.reject(new Error("스텁 없음")),
        stockNews: { getHeadlines: async () => [], feedHeadlines: async () => [] },
        dayFlowBody: async (date) => JSON.stringify({ date, stocks: [] }),
        chartLines: null,
        replayDay: null,
        ...ports,
    });
    return async (path: string, method = "GET", body?: unknown) => {
        const res = await app.request(path, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
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
    expect(post.json).toEqual({ error: "GET 만 받는다(쓰기는 /chart-lines 만)" });
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

describe("stocks", () => {
    it("주입된 listStocks 를 그대로 배열로(상장일 listedAt 포함) · 옛 /stocks/master·/stocks/:code 는 없다", async () => {
        const rows = [
            { stockCode: "000001", name: "알파", market: "거래소", listedAt: "2020-03-02" },
            { stockCode: "000002", name: "베타", market: "코스닥", listedAt: null },
        ];
        const call = make({ listStocks: async () => rows });
        const r = await call("/stocks");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(rows);
        expect((await call("/stocks/master")).json).toEqual({ error: "없는 경로: /stocks/master" });
        expect((await call("/stocks/000001")).status).toBe(404);
    });
});

describe("marketcap", () => {
    it("code·from·to 검증 통과 시 주입된 marketCapSeries 결과를 그대로 — 기간은 그대로 넘긴다", async () => {
        const seen: unknown[] = [];
        const points = [
            { date: "2025-01-02", cap: "1000" },
            { date: "2025-01-03", cap: "1100" },
        ];
        const call = make({ marketCapSeries: async (code, range) => (seen.push([code, range]), points) });
        const r = await call("/marketcap?code=000001&from=2025-01-01&to=2025-12-31");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(points);
        expect((await call("/marketcap?code=000001&from=2025-01-02&to=2025-01-02")).status).toBe(200); // 하루짜리도 정상
        expect(seen).toEqual([
            ["000001", { from: "2025-01-01", to: "2025-12-31" }],
            ["000001", { from: "2025-01-02", to: "2025-01-02" }],
        ]);
    });
    it("code·from·to 빠짐·불량·뒤집힘 = 400(/daily 와 같은 문구)", async () => {
        const call = make();
        expect((await call("/marketcap?from=2021-01-01&to=2021-02-01")).json).toMatchObject({ message: "code 필수", statusCode: 400 });
        expect((await call("/marketcap?code=5930&from=2021-01-01&to=2021-02-01")).json).toMatchObject({ message: "code 형식(6자리 영숫자): 5930" });
        expect((await call("/marketcap?code=000001&to=2021-02-01")).json).toMatchObject({ message: "from 필수(YYYY-MM-DD)" });
        expect((await call("/marketcap?code=000001&from=2021-01-01")).json).toMatchObject({ message: "to 필수(YYYY-MM-DD)" });
        expect((await call("/marketcap?code=000001&from=2021-01-01&to=2021-02-30")).json).toMatchObject({ message: "to 가 유효한 날짜가 아님: 2021-02-30" });
        const flipped = await call("/marketcap?code=000001&from=2021-02-01&to=2021-01-01");
        expect(flipped.status).toBe(400);
        expect(flipped.json).toMatchObject({ message: "from(2021-02-01) 이 to(2021-01-01) 보다 뒤입니다" });
    });
});

describe("minutes", () => {
    it("code·date 검증 통과 시 주입된 minutesByDate 결과를 그대로", async () => {
        const day = { stockCode: "000001", date: "", minutes: [], basePrice: null, rawScale: 1 };
        const call = make({ minutesByDate: async (code, date) => ({ ...day, date: `${code}@${date}` }) });
        const r = await call("/minutes?code=000001&date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ ...day, date: "000001@2025-01-02" });
        expect((await call("/chart?code=000001&date=2025-01-02")).status).toBe(404); // 옛 묶음은 은퇴
    });
    it("code 없음·date 불량 = 400, NestJS 와 같은 body", async () => {
        const call = make();
        const noCode = await call("/minutes?date=2025-01-02");
        expect(noCode.status).toBe(400);
        expect(noCode.json).toEqual({ message: "code 필수", error: "Bad Request", statusCode: 400 });
        const badDate = await call("/minutes?code=000001&date=2025-02-30");
        expect(badDate.status).toBe(400);
        expect(badDate.json).toEqual({ message: "date 가 유효한 날짜가 아님: 2025-02-30", error: "Bad Request", statusCode: 400 });
    });
});

describe("daily", () => {
    it("code·from·to 검증 통과 시 주입된 dailyByCode 결과를 그대로 — 기간은 그대로 넘긴다", async () => {
        const seen: unknown[] = [];
        const bar = { open: "1", high: "2", low: "1", close: "2", volume: "10", amount: "20" };
        const rows = [{ stockCode: "000001", date: "2021-01-04", krx: bar, un: bar }];
        const call = make({ dailyByCode: async (code, range) => (seen.push([code, range]), rows) });
        const r = await call("/daily?code=000001&from=2021-01-01&to=2026-10-27");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(rows);
        expect(seen).toEqual([["000001", { from: "2021-01-01", to: "2026-10-27" }]]);
        const oneDay = await call("/daily?code=000001&from=2025-01-02&to=2025-01-02"); // 하루짜리(from == to)도 정상
        expect(oneDay.status).toBe(200);
        expect(seen[1]).toEqual(["000001", { from: "2025-01-02", to: "2025-01-02" }]);
    });
    it("code·from·to 빠짐·불량·뒤집힘 = 400", async () => {
        const call = make();
        expect((await call("/daily?from=2021-01-01&to=2021-02-01")).json).toMatchObject({ message: "code 필수", statusCode: 400 });
        expect((await call("/daily?code=000001&to=2021-02-01")).json).toMatchObject({ message: "from 필수(YYYY-MM-DD)" });
        expect((await call("/daily?code=000001&from=2021-01-01")).json).toMatchObject({ message: "to 필수(YYYY-MM-DD)" });
        expect((await call("/daily?code=000001&from=2021-01-01&to=2021-02-30")).json).toMatchObject({ message: "to 가 유효한 날짜가 아님: 2021-02-30" });
        const flipped = await call("/daily?code=000001&from=2021-02-01&to=2021-01-01");
        expect(flipped.status).toBe(400);
        expect(flipped.json).toMatchObject({ message: "from(2021-02-01) 이 to(2021-01-01) 보다 뒤입니다" });
    });
});

describe("chart-lines", () => {
    const line = { chartDate: "2026-07-28", anchorDate: "2026-06-26", anchorTime: null, field: "H", market: "un" };
    it("쓰기는 이 경로만 열린다 — POST/DELETE body {code, line}, 저장소 결과를 그대로", async () => {
        const seen: unknown[] = [];
        const store = {
            list: async (code: string, date?: string) => (seen.push(["list", code, date]), []),
            add: async (code: string, l: unknown) => (seen.push(["add", code, l]), [l]),
            remove: async (code: string, l: unknown) => (seen.push(["remove", code, l]), []),
        };
        const call = make({ chartLines: store as never });
        expect((await call("/chart-lines?code=000660&date=2026-07-28")).json).toEqual([]);
        expect((await call("/chart-lines", "POST", { code: "000660", line })).json).toEqual([line]);
        expect((await call("/chart-lines", "DELETE", { code: "000660", line })).status).toBe(200);
        expect(seen).toEqual([["list", "000660", "2026-07-28"], ["add", "000660", line], ["remove", "000660", line]]);
        expect((await call("/chart-lines", "PUT", { code: "000660", line })).status).toBe(405);
    });
    it("틀린 body 는 400, 폴더 미설정은 500", async () => {
        const call = make({ chartLines: { list: async () => [], add: async () => [], remove: async () => [] } });
        expect((await call("/chart-lines", "POST", { code: "000660", line: { ...line, field: "X" } })).status).toBe(400);
        expect((await call("/chart-lines", "POST", { line })).json).toMatchObject({ message: "code 필수" });
        expect((await make()("/chart-lines?code=000660")).status).toBe(500);
        expect((await call("/chart-lines?date=2026-07-28")).status).toBe(400); // code 없음
        expect((await call("/chart-lines?code=000660&date=2026-02-30")).status).toBe(400);
        const notJson = await make({ chartLines: { list: async () => [], add: async () => [], remove: async () => [] } });
        expect((await notJson("/chart-lines", "DELETE", "{깨짐")).status).toBe(400);
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

describe("replay/day", () => {
    // 작은 tdm-ai 모양 — 장부 하루 + 이름 바꾸기. 계산(이름 바꾸기·합치기·from)의 세부는 replay/day.test.ts.
    let dir: string;
    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), "replay-app-"));
        await mkdir(join(dir, "theme/replay/curated"), { recursive: true });
        const rows = [
            {
                date: "2023-01-05", code: "002990", name: "금호건설",
                pre: [{ theme: "건설", basis: ["base"] }],
                close: [{ theme: "건설", sub: "두바이 투자", basis: ["issue", "base"], since: "14:11" }],
                evidence: ["g1"], why: "두바이 투자 소식에 상한가.", unsure: "x", closing: "사후", brief: "b", reviewed: "opus", by: "ai",
            },
        ];
        await writeFile(join(dir, "theme/replay/curated/2023-01-05.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
        await writeFile(join(dir, "theme/replay/renames.jsonl"), JSON.stringify({ from: "두바이 투자", to: "중동 투자", by: "user" }) + "\n");
    });
    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("그날 장부 → 이름표(이름 바꾸기 겹침 · from) — 작업 메모(closing·unsure·brief·reviewed·evidence·by)는 안 싣는다", async () => {
        const call = make({ replayDay: makeReplayDayReader(dir) });
        const r = await call("/replay/day?date=2023-01-05");
        expect(r.status).toBe(200);
        expect(r.json).toEqual({
            date: "2023-01-05",
            rows: [
                {
                    code: "002990",
                    name: "금호건설",
                    labels: [
                        { theme: "건설", sub: "중동 투자", basis: ["issue", "base"], from: "14:11" },
                        { theme: "건설", basis: ["base"], from: "open" },
                    ],
                    why: "두바이 투자 소식에 상한가.",
                },
            ],
        });
    });
    it("장부 없는 날 = 404 {error: 분류 없는 날…} — 배선 오류 404(없는 경로)와 문구로 갈린다", async () => {
        const call = make({ replayDay: makeReplayDayReader(dir) });
        const r = await call("/replay/day?date=2023-01-06");
        expect(r.status).toBe(404);
        expect(r.json).toEqual({ error: "분류 없는 날: 2023-01-06" });
    });
    it("date 빠짐·불량 = 400", async () => {
        const call = make({ replayDay: makeReplayDayReader(dir) });
        expect((await call("/replay/day")).json).toMatchObject({ message: "date 필수(YYYY-MM-DD)", statusCode: 400 });
        expect((await call("/replay/day?date=2023-02-30")).json).toMatchObject({ message: "date 가 유효한 날짜가 아님: 2023-02-30" });
    });
    it("TDM_AI_DIR 미설정(replayDay=null) = NestJS 꼴 500 + onError — market DB 미설정과 같은 결", async () => {
        const seen: unknown[] = [];
        const call = make({ onError: (e) => seen.push(e) }); // 기본 replayDay: null
        const r = await call("/replay/day?date=2023-01-05");
        expect(r.status).toBe(500);
        expect(r.json).toEqual({ statusCode: 500, message: "Internal server error" });
        expect(seen).toHaveLength(1);
        expect((seen[0] as Error).message).toContain("TDM_AI_DIR");
    });
    it("은퇴한 /theme/registry · /theme/stocks 는 그냥 404", async () => {
        const call = make({ replayDay: makeReplayDayReader(dir) });
        expect((await call("/theme/registry")).json).toEqual({ error: "없는 경로: /theme/registry" });
        expect((await call("/theme/stocks/000001")).status).toBe(404);
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
                coverage: async () => ({
                    from: new Date("2024-01-01T00:00:00Z"),
                    to: new Date("2025-02-01T00:00:00Z"),
                    channels: [{ channel: "방", from: new Date("2022-01-01T00:00:00Z") }],
                }),
            },
        });
        const r = await call("/news/telegram/archive?date=2025-01-02");
        expect(r.status).toBe(200);
        expect(r.json).toEqual({
            items: [{ channel: "방", at: "2025-01-02T01:00:00.000Z", text: "본문", ref: "p#1" }],
            coverage: {
                from: "2024-01-01T00:00:00.000Z",
                to: "2025-02-01T00:00:00.000Z",
                channels: [{ channel: "방", from: "2022-01-01T00:00:00.000Z" }],
            },
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
