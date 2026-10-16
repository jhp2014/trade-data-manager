// lab 이 대면하는 백엔드(Hono) — 1호 입주자는 판단 저장소(trade-judgment) 읽기, 2호는 시장 읽기(/dates, tdm api 잠식 1호).
// 화면 쪽 어댑터는 apps/lab/src/judgment/server.ts — lab 의 Vite 프록시가 /judgment/* 를 이리로 보낸다(경로 그대로, rewrite 없음).
//   GET /judgment/history/themes?date=<날짜>          → { date, stocks: { <코드>: [테마…] }, coverage }  · 그날 이전 이력으로
//   GET /judgment/history/stocks/<코드>?date=<날짜>   → StockHistory(judgment/history.ts)   · 이력 없음 404
//   GET /dates                                        → string[](YYYY-MM-DD 오름차순) · tdm api GET /dates 와 같은 경로·꼴(lab 프록시가 /api 만 떼고 넘긴다)
//   GET /stocks/master                                → StockMeta[](코드 오름차순 전량) · tdm api 와 같은 꼴, 캐시 없이 직쿼리
//   GET /news/telegram/archive?date=|from=&to=[&q=…]  → TelegramArchivePage · 조립은 market/telegramArchive.ts, 400 은 NestJS 와 같은 body
//   GET /chart?code=&date=                            → ChartBundle(일봉 2년+dense 분봉+basePrice·rawScale) · 조립은 market/chart.ts
//   GET /news/hts?date=[&code=&q=&before…]            → HtsNewsItem[](최신순) · 조립은 market/htsNews.ts
import { statSync } from "node:fs";
import { Hono } from "hono";
import type { DataDate, StockMeta } from "@trade-data-manager/wire";
import { HistoryError, HistoryRepo } from "./judgment/history.js";
import type { StockNewsReader } from "@trade-data-manager/market";
import type { ChartByCode } from "./market/chart.js";
import { htsNews } from "./market/htsNews.js";
import { telegramArchivePage, type TelegramArchivePorts } from "./market/telegramArchive.js";
import { assertStockCode, assertYmd, BadRequest } from "./market/validation.js";

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
    /** GET /dates 의 데이터 — 분봉 있는 거래일 전체(오름차순). 캐시 없이 매 요청 조회(사용자 결정). */
    listDates: () => Promise<DataDate[]>;
    /** GET /stocks/master 의 데이터 — 종목 마스터 전량(코드·이름·시장, 코드 오름차순). 캐시 없음. */
    listStockMeta: () => Promise<StockMeta[]>;
    /** GET /news/telegram/archive 의 데이터 — 아카이브 검색·coverage(market/telegramArchive.ts). */
    telegramArchive: TelegramArchivePorts;
    /** GET /chart 의 데이터 — ChartBundle 조립(market/chart.ts 의 makeChartByCode). */
    chartByCode: ChartByCode;
    /** GET /news/hts 의 데이터 — core StockNewsReader(읽기 2개) 그대로(market/htsNews.ts 가 소비). */
    stockNews: StockNewsReader;
    /** 예상 밖 오류(500) 로깅 — HistoryError 같은 요청 쪽 잘못은 안 온다. */
    onError?: (e: unknown) => void;
}

export function createApp({
    judgmentRoot,
    listDates,
    listStockMeta,
    telegramArchive,
    chartByCode,
    stockNews,
    onError = () => undefined,
}: AppOptions) {
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

    app.get("/dates", async (c) => c.json(await listDates()));
    app.get("/stocks/master", async (c) => c.json(await listStockMeta()));
    app.get("/chart", async (c) =>
        c.json(await chartByCode(assertStockCode(c.req.query("code")), assertYmd(c.req.query("date")))),
    );
    app.get("/news/hts", async (c) =>
        c.json(
            await htsNews(stockNews, {
                code: c.req.query("code"),
                q: c.req.query("q"),
                date: c.req.query("date"),
                beforeDate: c.req.query("beforeDate"),
                beforeSrno: c.req.query("beforeSrno"),
                limit: c.req.query("limit"),
            }),
        ),
    );
    app.get("/news/telegram/archive", async (c) =>
        c.json(
            await telegramArchivePage(telegramArchive, {
                date: c.req.query("date"),
                from: c.req.query("from"),
                to: c.req.query("to"),
                q: c.req.query("q"),
                limit: c.req.query("limit"),
                before: c.req.query("before"),
            }),
        ),
    );

    app.notFound((c) => c.json({ error: `없는 경로: ${new URL(c.req.url).pathname}` }, 404));
    app.onError((e, c) => {
        if (e instanceof HistoryError) return c.json({ error: e.message }, e.status);
        // 시장 경로의 400 — tdm api(NestJS BadRequestException)와 같은 body(strangler: 에러 응답도 동일하게).
        if (e instanceof BadRequest) return c.json({ message: e.message, error: "Bad Request", statusCode: 400 }, 400);
        onError(e);
        // /judgment 는 {error} 꼴 유지(기존 클라 계약), 시장 경로는 NestJS 500 과 같은 body — lab 의 serverMessage 가 message 를 꺼낸다.
        if (new URL(c.req.url).pathname.startsWith("/judgment")) return c.json({ error: "lab-api 서버 오류" }, 500);
        return c.json({ statusCode: 500, message: "Internal server error" }, 500);
    });

    return { app, warm: () => history.warm(), close: () => history.close() };
}
