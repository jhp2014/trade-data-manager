// lab 이 대면하는 백엔드(Hono) — 시장 읽기 전용. 옛 /judgment(trade-judgment 판단 저장소 읽기)는 2026-10-17 은퇴 —
// 등록부 기반 새 조회가 후계(tdm-ai, 결정 로그 「판단·AI 가공의 작업장」).
//   GET /dates                                        → string[](YYYY-MM-DD 오름차순) · tdm api GET /dates 와 같은 경로·꼴(lab 프록시가 /api 만 떼고 넘긴다)
//   GET /stocks/master                                → StockMeta[](코드 오름차순 전량) · tdm api 와 같은 꼴, 캐시 없이 직쿼리
//   GET /news/telegram/archive?date=|from=&to=[&q=…]  → TelegramArchivePage · 조립은 market/telegramArchive.ts, 400 은 NestJS 와 같은 body
//   GET /chart?code=&date=                            → ChartBundle(일봉 2년+dense 분봉+basePrice·rawScale) · 조립은 market/chart.ts
//   GET /news/hts?date=[&code=&q=&before…]            → HtsNewsItem[](최신순) · 조립은 market/htsNews.ts
//   GET /day-flow?date=                               → DayFlow(그날 universe 전부의 분당 원값 — 표현(%·누적)은 클라) · lab 전용 계약, 조립은 market/dayFlow.ts
//   GET /theme/registry                               → ThemeKeyword[](tdm-ai 등록부 그대로) · 계약은 wire/labTheme.ts
//   GET /theme/stocks/:code?asOf=                     → StockMoves(움직인 날) · asOf 있으면 date <= asOf 만(사후정보 차단은 서버 몫), 없는 종목 404
import { Hono } from "hono";
import type { DataDate, StockMeta } from "@trade-data-manager/wire";
import type { StockNewsReader } from "@trade-data-manager/market";
import type { ThemeStore } from "./theme/store.js";
import type { ChartByCode } from "./market/chart.js";
import type { DayFlowBody } from "./market/dayFlowCache.js";
import { htsNews } from "./market/htsNews.js";
import { telegramArchivePage, type TelegramArchivePorts } from "./market/telegramArchive.js";
import { assertStockCode, assertYmd, BadRequest } from "./market/validation.js";

export interface AppOptions {
    /** GET /dates 의 데이터 — 분봉 있는 거래일 전체(오름차순). wiring 은 파일 물화+꼬리 증분(market/dataDates.ts). */
    listDates: () => Promise<DataDate[]>;
    /** GET /stocks/master 의 데이터 — 종목 마스터 전량(코드·이름·시장, 코드 오름차순). 캐시 없음. */
    listStockMeta: () => Promise<StockMeta[]>;
    /** GET /news/telegram/archive 의 데이터 — 아카이브 검색·coverage(market/telegramArchive.ts). */
    telegramArchive: TelegramArchivePorts;
    /** GET /chart 의 데이터 — ChartBundle 조립(market/chart.ts 의 makeChartByCode). */
    chartByCode: ChartByCode;
    /** GET /news/hts 의 데이터 — core StockNewsReader(읽기 2개) 그대로(market/htsNews.ts 가 소비). */
    stockNews: StockNewsReader;
    /** GET /day-flow 의 데이터 — JSON **문자열**(캐시 히트 때 재직렬화를 피한다, market/dayFlowCache.ts). */
    dayFlowBody: DayFlowBody;
    /** GET /theme/* 의 데이터 — tdm-ai 테마 저장소(theme/store.ts). null = TDM_AI_DIR 미설정/적재 실패 → 요청마다 500(market DB 미설정과 같은 결). */
    theme: Pick<ThemeStore, "keywords" | "movesByCode"> | null;
    /** 예상 밖 오류(500) 로깅 — BadRequest 같은 요청 쪽 잘못은 안 온다. */
    onError?: (e: unknown) => void;
}

export function createApp({
    listDates,
    listStockMeta,
    telegramArchive,
    chartByCode,
    stockNews,
    dayFlowBody,
    theme,
    onError = () => undefined,
}: AppOptions): Hono {
    const app = new Hono();

    // lab-api 는 읽기 전용 — GET 외는 경로가 있어도 405(규칙을 코드로: 쓰기 라우트가 생기는 것 자체를 막는다).
    app.use("*", async (c, next) => {
        if (c.req.method !== "GET") return c.json({ error: "GET 만 받는다" }, 405);
        await next();
    });

    app.get("/dates", async (c) => c.json(await listDates()));
    app.get("/stocks/master", async (c) => c.json(await listStockMeta()));
    app.get("/chart", async (c) =>
        c.json(await chartByCode(assertStockCode(c.req.query("code")), assertYmd(c.req.query("date")))),
    );
    app.get("/day-flow", async (c) =>
        c.body(await dayFlowBody(assertYmd(c.req.query("date"))), 200, { "content-type": "application/json; charset=utf-8" }),
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

    // 테마 저장소가 비면(miswiring 아님 — TDM_AI_DIR 미설정/적재 실패) 원인 메시지로 throw → onError 로그 + 500.
    const requireTheme = () => {
        if (!theme) throw new Error("테마 저장소 미적재(TDM_AI_DIR 미설정 또는 적재 실패)");
        return theme;
    };
    app.get("/theme/registry", (c) => c.json(requireTheme().keywords));
    app.get("/theme/stocks/:code", (c) => {
        const store = requireTheme();
        const code = assertStockCode(c.req.param("code"));
        const asOfRaw = c.req.query("asOf");
        const asOf = asOfRaw === undefined ? undefined : assertYmd(asOfRaw, "asOf");
        const moves = store.movesByCode.get(code);
        // 이력 없는 종목은 빈 issues 가 아니라 404 — "기록이 없다"와 "움직인 날이 없다"를 섞지 않는다.
        if (!moves) return c.json({ error: `이력 없는 종목: ${code}` }, 404);
        return c.json(asOf === undefined ? moves : { ...moves, issues: moves.issues.filter((i) => i.date <= asOf) });
    });

    app.notFound((c) => c.json({ error: `없는 경로: ${new URL(c.req.url).pathname}` }, 404));
    app.onError((e, c) => {
        // 시장 경로의 400 — tdm api(NestJS BadRequestException)와 같은 body(strangler: 에러 응답도 동일하게).
        if (e instanceof BadRequest) return c.json({ message: e.message, error: "Bad Request", statusCode: 400 }, 400);
        onError(e);
        // NestJS 500 과 같은 body — lab 의 serverMessage 가 message 를 꺼낸다.
        return c.json({ statusCode: 500, message: "Internal server error" }, 500);
    });

    return app;
}
