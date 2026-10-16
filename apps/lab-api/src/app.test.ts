// 경로 · 상태 코드를 본다(계산은 judgment/history.test). Hono 라 서버 없이 app.request 로 부른다.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

let root: string;
let close: () => void;
let call: (path: string, method?: string) => Promise<{ status: number; headers: Headers; json: Record<string, unknown> }>;

function make(r: string, listDates: () => Promise<string[]> = async () => []): void {
    const made = createApp({ judgmentRoot: r, listDates });
    close = made.close;
    call = async (path, method = "GET") => {
        const res = await made.app.request(path, { method });
        return { status: res.status, headers: res.headers, json: (await res.json()) as Record<string, unknown> };
    };
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "judgment-app-"));
    await mkdir(join(root, "이력"), { recursive: true });
    await mkdir(join(root, "관점"), { recursive: true });
    await writeFile(join(root, "관점", "테마 사전.md"), "| 테마 | 이력 이름 | 상위 |\n|---|---|---|\n| 반도체 | HBM | |\n");
    const rows = [
        { v: 1, kind: "stock", id: "stock", code: "000001", name: "알파" },
        { v: 1, kind: "issue", id: "2025-01-02", date: "2025-01-02", themes: ["HBM"], issue: "x", high: null, evidence: [{ src: "cafe", title: "1. HBM", pct: 5 }] },
    ];
    await writeFile(join(root, "이력", "000001.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
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
        make(root, async () => ["2025-01-02", "2025-01-03"]);
        const r = await call("/dates");
        expect(r.status).toBe(200);
        expect(r.json).toEqual(["2025-01-02", "2025-01-03"]);
        expect(r.headers.get("cache-control")).toBeNull();
    });
    it("listDates 실패 = 500 JSON + onError — 빈 배열로 삼키지 않는다", async () => {
        close();
        const seen: unknown[] = [];
        const made = createApp({
            judgmentRoot: root,
            listDates: () => Promise.reject(new Error("DB down")),
            onError: (e) => seen.push(e),
        });
        close = made.close;
        const res = await made.app.request("/dates");
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: "lab-api 서버 오류" });
        expect(seen).toHaveLength(1);
    });
});
