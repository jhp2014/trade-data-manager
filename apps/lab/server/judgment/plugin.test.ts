// /judgment 요청 처리기 — 진짜 http 서버(포트 0)에 붙여 경로 · 상태 코드를 본다(계산은 history.test).
// (기본 jsdom 환경에서 돈다 — node:http · fs 는 그대로 쓸 수 있다.)
import { createServer, request, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJudgmentHandler } from "./plugin.js";

let root: string;
let server: Server;
let close: () => void;

function serve(r: string): Promise<void> {
    const h = createJudgmentHandler(r);
    close = h.close;
    // connect 는 /judgment 를 떼고 넘긴다 — 여기서도 똑같이.
    server = createServer((req, res) => {
        req.url = (req.url ?? "/").replace(/^\/judgment/, "") || "/";
        h.handle(req, res);
    });
    return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok()));
}

function call(method: string, path: string): Promise<{ status: number; json: Record<string, unknown> }> {
    const { port } = server.address() as AddressInfo;
    return new Promise((ok, fail) => {
        const req = request({ host: "127.0.0.1", port, method, path }, (res) => {
            let s = "";
            res.setEncoding("utf8");
            res.on("data", (c) => (s += c));
            res.on("end", () => ok({ status: res.statusCode ?? 0, json: s ? JSON.parse(s) : {} }));
        });
        req.on("error", fail);
        req.end();
    });
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "judgment-plugin-"));
    await mkdir(join(root, "이력"), { recursive: true });
    await mkdir(join(root, "관점"), { recursive: true });
    await writeFile(join(root, "관점", "테마 사전.md"), "| 테마 | 이력 이름 | 상위 |\n|---|---|---|\n| 반도체 | HBM | |\n");
    const rows = [
        { v: 1, kind: "stock", id: "stock", code: "000001", name: "알파" },
        { v: 1, kind: "issue", id: "2025-01-02", date: "2025-01-02", themes: ["HBM"], issue: "x", high: null, evidence: [{ src: "cafe", title: "1. HBM", pct: 5 }] },
    ];
    await writeFile(join(root, "이력", "000001.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    await serve(root);
});
afterEach(async () => {
    close();
    await new Promise((ok) => server.close(ok));
    await rm(root, { recursive: true, force: true });
});

describe("history", () => {
    it("themes · stocks 200", async () => {
        expect(await call("GET", "/judgment/history/themes?date=2025-02-01")).toEqual({ status: 200, json: { date: "2025-02-01", stocks: { "000001": ["반도체"] }, coverage: null } });
        const s = await call("GET", "/judgment/history/stocks/000001?date=2025-02-01");
        expect(s.status).toBe(200);
        expect(s.json).toMatchObject({ code: "000001", name: "알파", asOf: "2025-02-01", closing: null });
    });
    it("날짜 형식 400 · 이력 없음 404 · GET 아님 405 · 없는 경로 404", async () => {
        expect((await call("GET", "/judgment/history/themes")).status).toBe(400);
        expect((await call("GET", "/judgment/history/stocks/999999?date=2025-02-01")).status).toBe(404);
        expect((await call("POST", "/judgment/history/themes?date=2025-02-01")).status).toBe(405);
        expect((await call("GET", "/judgment/cases/x/2025-02-01")).status).toBe(404);
    });
    it("판단 저장소가 없으면 503", async () => {
        close();
        await new Promise((ok) => server.close(ok));
        await serve(join(root, "없음"));
        expect((await call("GET", "/judgment/history/themes?date=2025-02-01")).status).toBe(503);
    });
});
