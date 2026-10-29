// 기동 — 포트는 LAB_API_PORT(사용 3300 / 개발 3310, launch.json lab-api-dev).
// market DB 는 읽기만. /dates 는 파일 물화(.cache/data-dates.json) + 꼬리 증분(market/dataDates.ts).
// 테마 저장소는 TDM_AI_DIR(판단 작업장 tdm-ai 경로)를 읽기만 — 기동 1회 적재, reload 없음(반영 = 재시작, theme/store.ts).
// TDM_AI_DIR 는 자급 .env(apps/lab-api/.env — git 밖, 수동 생성)에 둔다 — apps/api 의 VAULT_DIR 와 같은 패턴.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
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
import { createApp } from "./app.js";
import { makeLabChart } from "./market/labChart.js";
import { MaterializedDataDates } from "./market/dataDates.js";
import { makeDayFlowByDate } from "./market/dayFlow.js";
import { makeCachedDayFlowBody } from "./market/dayFlowCache.js";
import { loadThemeStore, type ThemeStore } from "./theme/store.js";

// 자급 .env 1회 로드(없으면 조용히 넘어간다) — 이미 있는 process.env 는 덮지 않는다(dotenv 기본).
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const port = Number(process.env.LAB_API_PORT ?? 3300);

// market DB 미설정(DATABASE_URL 없음)이어도 서버는 뜬다 — 요청마다 500 으로 원인을 말한다(기동 크래시보다 진단이 쉽다).
type MarketPorts = Pick<
    Parameters<typeof createApp>[0],
    "listDates" | "listStockMeta" | "telegramArchive" | "dailyByCode" | "minutesByDate" | "stockNews" | "dayFlowBody"
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
        const labChart = makeLabChart({ dailyCandle: daily, rawDailyCandle: rawDaily, minuteCandle: minutes });
        const dates = new MaterializedDataDates(minutes); // /dates 파일 물화(.cache) — 풀스캔 6~20s 를 첫 생성 1회로

        const labels = new Map(NEWS_CHANNELS.map((c) => [c.peer, c.label]));
        const archive = new ArchiveNewsSearchService({ reader: telegram, labels });
        const peers = NEWS_CHANNELS.map((c) => c.peer);
        return {
            listDates: () => dates.list(),
            listStockMeta: () => master.listAllMeta(),
            telegramArchive: {
                searchPage: (q, opts) => archive.searchPage(q, opts),
                coverage: async () => {
                    const c = await telegram.coverage(peers);
                    if (!c) return null;
                    const channels = c.perChannel.map((p) => ({ channel: labels.get(p.peer) ?? p.peer, from: p.from }));
                    return { from: c.from, to: c.to, channels };
                },
            },
            dailyByCode: labChart.dailyWithFix,
            minutesByDate: labChart.minutesByDate,
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
            dailyByCode: reject,
            minutesByDate: reject,
            stockNews: { getHeadlines: reject, feedHeadlines: reject },
            dayFlowBody: reject,
            closePool: () => undefined,
        };
    }
}
const { closePool, ...market } = wireMarket();

// 테마 저장소(tdm-ai 읽기 전용) — 미설정·적재 실패여도 서버는 뜬다(시장 경로와 무관). null 이면 /theme/* 가 요청마다 500.
async function wireTheme(): Promise<ThemeStore | null> {
    const dir = process.env.TDM_AI_DIR;
    if (!dir) {
        console.warn("[lab-api] TDM_AI_DIR 미설정 — 테마 저장소 적재 생략");
        return null;
    }
    try {
        const store = await loadThemeStore(dir);
        console.log(
            `[lab-api] 테마 저장소 적재 — 키워드 ${store.keywords.length} · 종목 ${store.movesByCode.size} · 테마 ${store.rostersByTheme.size} (반영은 재시작)`,
        );
        return store;
    } catch (e) {
        console.warn("[lab-api] 테마 저장소 적재 실패 — 테마 쪽은 비활성:", e instanceof Error ? e.message : e);
        return null;
    }
}
const themeStore = await wireTheme();

const app = createApp({ ...market, theme: themeStore, onError: (e) => console.error("[lab-api]", e) });

// loopback 에만 붙는다 — 소비자가 같은 기기의 Vite 프록시뿐이다.
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log(`lab-api :${info.port}`);
});
server.on("close", closePool);
