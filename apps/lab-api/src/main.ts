// 기동 — 포트는 LAB_API_PORT(사용 3300 / 개발 3310, launch.json lab-api-dev), 판단 저장소는 JUDGMENT_DIR(기본: 레포 옆 trade-judgment).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp, hasJudgmentRoot } from "./app.js";

const port = Number(process.env.LAB_API_PORT ?? 3300);
const judgmentRoot =
    process.env.JUDGMENT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../trade-judgment");

const { app, warm, close } = createApp({ judgmentRoot, onError: (e) => console.error("[judgment]", e) });
if (hasJudgmentRoot(judgmentRoot)) warm();
else console.warn(`[judgment] 판단 저장소가 없다: ${judgmentRoot} — /judgment 요청은 503`);

// loopback 에만 붙는다 — 개인 판단 이력이라, 소비자도 같은 기기의 Vite 프록시뿐이다(옛 Vite 내장 시절과 같은 노출 범위).
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log(`lab-api :${info.port} (judgment: ${judgmentRoot})`);
});
server.on("close", close);
