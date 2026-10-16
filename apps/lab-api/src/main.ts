// 기동 — 포트는 LAB_API_PORT(사용 3300 / 개발 3310, launch.json lab-api-dev), 판단 저장소는 JUDGMENT_DIR(기본: 레포 옆 trade-judgment).
// market DB 는 읽기만. /dates 는 파일 물화(.cache/data-dates.json) + 꼬리 증분(market/dataDates.ts).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { ArchiveNewsSearchService } from "@trade-data-manager/market";
import {
    createPoolFromEnv,
    createDb,
    DrizzleDailyCandleRepository,
    DrizzleDailyMarketCapRepository,
    DrizzleDailyUniverseProvider,
    DrizzleMinuteCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleStockMasterRepository,
    DrizzleStockNewsRepository,
    DrizzleTelegramMessageRepository,
} from "@trade-data-manager/persistence";
// 패키지 지정자("@trade-data-manager/telegram")는 index 가 GramJS(client.ts)를 모듈 로드에 끌고 온다 —
// 상수(채널 레지스트리)만 필요하므로 파일 직접 경로로 피한다(exports 는 패키지 지정자에만 적용).
import { NEWS_CHANNELS } from "../../../infra/telegram/src/channels.js";
import { createApp, hasJudgmentRoot } from "./app.js";
import { makeChartByCode } from "./market/chart.js";
import { MaterializedDataDates } from "./market/dataDates.js";
import { makeDayFlowByDate } from "./market/dayFlow.js";
import { makeCachedDayFlowBody } from "./market/dayFlowCache.js";

const port = Number(process.env.LAB_API_PORT ?? 3300);
const judgmentRoot =
    process.env.JUDGMENT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../trade-judgment");

// market DB 미설정(DATABASE_URL 없음)이어도 서버는 뜬다 — /judgment 는 멀쩡하고 시장 경로만 500(판단 저장소 없음=503 과 같은 부분 실패 결).
type MarketPorts = Pick<
    Parameters<typeof createApp>[0],
    "listDates" | "listStockMeta" | "telegramArchive" | "chartByCode" | "stockNews" | "dayFlowBody"
>;
function wireMarket(): MarketPorts & { closePool: () => void } {
    try {
        const pool = createPoolFromEnv();
        const db = createDb(pool);
        const minutes = new DrizzleMinuteCandleRepository(db);
        const daily = new DrizzleDailyCandleRepository(db);
        const rawDaily = new DrizzleRawDailyCandleRepository(db);
        const master = new DrizzleStockMasterRepository(db);
        const telegram = new DrizzleTelegramMessageRepository(db);
        const dates = new MaterializedDataDates(minutes); // /dates 파일 물화(.cache) — 풀스캔 6~20s 를 첫 생성 1회로

        const archive = new ArchiveNewsSearchService({
            reader: telegram,
            labels: new Map(NEWS_CHANNELS.map((c) => [c.peer, c.label])),
        });
        const peers = NEWS_CHANNELS.map((c) => c.peer);
        return {
            listDates: () => dates.list(),
            listStockMeta: () => master.listAllMeta(),
            telegramArchive: {
                searchPage: (q, opts) => archive.searchPage(q, opts),
                coverage: () => telegram.coverage(peers),
            },
            chartByCode: makeChartByCode({ dailyCandle: daily, minuteCandle: minutes, rawDailyCandle: rawDaily }),
            stockNews: new DrizzleStockNewsRepository(db),
            // 과거 날짜 LRU(문자열 4벌) + 앞뒤 거래일 선계산 — 이웃 판정은 dates 물화 재사용.
            dayFlowBody: makeCachedDayFlowBody({
                compute: makeDayFlowByDate({
                    universe: new DrizzleDailyUniverseProvider(db),
                    minute: minutes,
                    rawDaily,
                    adjDaily: daily,
                    marketCap: new DrizzleDailyMarketCapRepository(db),
                }),
                tradingDays: () => dates.list(),
            }),
            closePool: () => void pool.end(),
        };
    } catch (e) {
        console.warn("[lab-api] market DB 미설정 — 시장 경로 요청은 500:", e instanceof Error ? e.message : e);
        const reject = () => Promise.reject(new Error("market DB 미설정(DATABASE_URL)"));
        return {
            listDates: reject,
            listStockMeta: reject,
            telegramArchive: { searchPage: reject, coverage: reject },
            chartByCode: reject,
            stockNews: { getHeadlines: reject, feedHeadlines: reject },
            dayFlowBody: reject,
            closePool: () => undefined,
        };
    }
}
const { closePool, ...market } = wireMarket();

const { app, warm, close } = createApp({
    judgmentRoot,
    ...market,
    onError: (e) => console.error("[lab-api]", e),
});
if (hasJudgmentRoot(judgmentRoot)) warm();
else console.warn(`[judgment] 판단 저장소가 없다: ${judgmentRoot} — /judgment 요청은 503`);

// loopback 에만 붙는다 — 개인 판단 이력이라, 소비자도 같은 기기의 Vite 프록시뿐이다(옛 Vite 내장 시절과 같은 노출 범위).
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log(`lab-api :${info.port} (judgment: ${judgmentRoot})`);
});
server.on("close", () => {
    close();
    closePool();
});
