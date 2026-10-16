// 기동 — 포트는 LAB_API_PORT(사용 3300 / 개발 3310, launch.json lab-api-dev), 판단 저장소는 JUDGMENT_DIR(기본: 레포 옆 trade-judgment).
// market DB 는 읽기만 — /dates 가 분봉 거래일 distinct 를 매 요청 직쿼리한다(캐시 없음).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createPoolFromEnv, createDb, DrizzleMinuteCandleRepository } from "@trade-data-manager/persistence";
import { createApp, hasJudgmentRoot } from "./app.js";

const port = Number(process.env.LAB_API_PORT ?? 3300);
const judgmentRoot =
    process.env.JUDGMENT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../trade-judgment");

// market DB 미설정(DATABASE_URL 없음)이어도 서버는 뜬다 — /judgment 는 멀쩡하고 /dates 만 500(판단 저장소 없음=503 과 같은 부분 실패 결).
function wireDates(): { listDates: () => Promise<string[]>; closePool: () => void } {
    try {
        const pool = createPoolFromEnv();
        const repo = new DrizzleMinuteCandleRepository(createDb(pool));
        return { listDates: () => repo.listMinuteDates(), closePool: () => void pool.end() };
    } catch (e) {
        console.warn("[lab-api] market DB 미설정 — /dates 요청은 500:", e instanceof Error ? e.message : e);
        return {
            listDates: () => Promise.reject(new Error("market DB 미설정(DATABASE_URL)")),
            closePool: () => undefined,
        };
    }
}
const { listDates, closePool } = wireDates();

const { app, warm, close } = createApp({
    judgmentRoot,
    listDates,
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
