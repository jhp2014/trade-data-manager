// lab 이 대면하는 백엔드(Hono) — 1호 입주자는 판단 저장소(trade-judgment) 읽기.
// 화면 쪽 어댑터는 apps/lab/src/judgment/server.ts — lab 의 Vite 프록시가 /judgment/* 를 이리로 보낸다(경로 그대로, rewrite 없음).
//   GET /judgment/history/themes?date=<날짜>          → { date, stocks: { <코드>: [테마…] }, coverage }  · 그날 이전 이력으로
//   GET /judgment/history/stocks/<코드>?date=<날짜>   → StockHistory(judgment/history.ts)   · 이력 없음 404
import { statSync } from "node:fs";
import { Hono } from "hono";
import { HistoryError, HistoryRepo } from "./judgment/history.js";

/** 판단 저장소가 있는가 — 503 판정과 기동 경고가 같은 질문을 쓴다(main.ts). */
export function hasJudgmentRoot(p: string): boolean {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
}

export interface AppOptions {
    /** 판단 저장소(trade-judgment) 루트. 없으면 서버는 뜨되 /judgment 요청에 503. */
    judgmentRoot: string;
    /** 예상 밖 오류(500) 로깅 — HistoryError 같은 요청 쪽 잘못은 안 온다. */
    onError?: (e: unknown) => void;
}

export function createApp({ judgmentRoot, onError = () => undefined }: AppOptions) {
    const history = new HistoryRepo(judgmentRoot);
    const app = new Hono();

    app.use("/judgment/*", async (c, next) => {
        c.header("cache-control", "no-store"); // 503·405 를 포함한 모든 /judgment 응답에
        if (!hasJudgmentRoot(judgmentRoot)) return c.json({ error: `판단 저장소가 없다: ${judgmentRoot}` }, 503);
        if (c.req.method !== "GET") return c.json({ error: "GET 만 받는다" }, 405);
        await next();
    });
    app.get("/judgment/history/themes", async (c) => {
        const date = c.req.query("date") ?? "";
        return c.json({ date, ...(await history.themesAsOf(date)) });
    });
    app.get("/judgment/history/stocks/:code", async (c) => {
        return c.json(await history.stock(c.req.param("code"), c.req.query("date") ?? ""));
    });

    app.notFound((c) => c.json({ error: `없는 경로: ${new URL(c.req.url).pathname}` }, 404));
    app.onError((e, c) => {
        if (e instanceof HistoryError) return c.json({ error: e.message }, e.status);
        onError(e);
        return c.json({ error: "판단 서버 오류" }, 500);
    });

    return { app, warm: () => history.warm(), close: () => history.close() };
}
