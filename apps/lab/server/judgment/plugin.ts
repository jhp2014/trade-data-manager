// 임시 판단 서버 — Vite dev 서버에 /judgment/* 를 붙인다(화면 쪽 어댑터: web/src/judgment/server.ts).
// trade-judgment 의 이슈 이력을 메모리에 올려 읽기만 한다(쓰기 없음 — 이력은 Claude 가 파일로 쌓는다).
// tdm 이 이력을 내려 주게 되면 이 서버는 빠진다 — 화면은 ports.ts 만 알고, 어댑터만 바꾼다.
//   GET /judgment/history/themes?date=<날짜>          → { date, stocks: { <코드>: [테마…] }, coverage }  · 그날 이전 이력으로
//   GET /judgment/history/stocks/<코드>?date=<날짜>   → StockHistory(history.ts)            · 이력 없음 404
import { statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { HistoryError, HistoryRepo } from "./history.js";

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(text),
        "cache-control": "no-store",
    });
    res.end(text);
}

function isDir(p: string): boolean {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
}

export interface JudgmentPluginOptions {
    /** 판단 저장소(trade-judgment) 루트. 없으면 서버는 뜨되 /judgment 요청에 503. */
    root: string;
}

/** /judgment 요청 처리기 — connect 가 앞의 /judgment 를 떼고 넘긴다(req.url = /history/…). */
export function createJudgmentHandler(root: string, onError: (e: unknown) => void = () => undefined) {
    const history = new HistoryRepo(root);

    async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (!isDir(root)) throw new HttpError(503, `판단 저장소가 없다: ${root}`);
        const url = new URL(req.url ?? "/", "http://localhost");
        let seg: string[];
        try {
            seg = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        } catch {
            throw new HttpError(400, "주소를 읽을 수 없다");
        }
        if (seg[0] !== "history") throw new HttpError(404, `없는 경로: /judgment${url.pathname}`);
        if (req.method !== "GET") throw new HttpError(405, "GET 만 받는다");
        const date = url.searchParams.get("date") ?? "";
        if (seg.length === 2 && seg[1] === "themes") return sendJson(res, 200, { date, ...(await history.themesAsOf(date)) });
        if (seg.length === 3 && seg[1] === "stocks") return sendJson(res, 200, await history.stock(seg[2]!, date));
        throw new HttpError(404, `없는 경로: /judgment${url.pathname}`);
    }

    function handle(req: IncomingMessage, res: ServerResponse): void {
        route(req, res).catch((e: unknown) => {
            if (res.headersSent) {
                res.end();
                return;
            }
            if (e instanceof HttpError || e instanceof HistoryError) return sendJson(res, e.status, { error: e.message });
            onError(e);
            sendJson(res, 500, { error: "판단 서버 오류" });
        });
    }

    return { handle, warm: () => history.warm(), close: () => history.close() };
}

/** Vite 플러그인 — dev 서버에만 붙는다(빌드에는 없다). 내장 미들웨어 · 프록시보다 먼저 받는다. */
export function judgmentPlugin({ root }: JudgmentPluginOptions): Plugin {
    return {
        name: "trade-lab:judgment",
        apply: "serve",
        configureServer(server) {
            const log = server.config.logger;
            if (!isDir(root)) log.warn(`[judgment] 판단 저장소가 없다: ${root} — /judgment 요청은 503`);
            const { handle, warm, close } = createJudgmentHandler(root, (e) =>
                log.error(`[judgment] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`),
            );
            server.middlewares.use("/judgment", (req, res) => handle(req, res));
            if (isDir(root)) warm();
            server.httpServer?.on("close", close);
        },
    };
}
