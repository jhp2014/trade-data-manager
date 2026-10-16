import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { judgmentPlugin } from "./server/judgment/plugin.js";

// 명령 하나 · 포트 하나(DESIGN 6절). 화면은 web/, /api 는 tdm api 로 프록시 — workbench 와 같은 길.
// 포트: 사용(trade-data-manager) 3200 / 개발(tdm-work) 3210(--port 로 올림, launch.json lab-dev).
// 프록시 타겟 기본 :3001(사용) — 개발 워크트리는 .env.local 의 API_PROXY_TARGET 으로 :3011 을 가리킨다.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiTarget = env.API_PROXY_TARGET || "http://localhost:3001";
    // 판단 저장소(trade-judgment) — 임시 판단 서버(/judgment/*)가 읽고 쓴다.
    // 기본은 레포(Dev/) 옆 폴더 — apps/lab 기준 세 단계 위. .env.local 의 JUDGMENT_DIR 로 바꿀 수 있다.
    const judgmentDir = env.JUDGMENT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../trade-judgment");
    return {
        root: "web",
        plugins: [react(), judgmentPlugin({ root: judgmentDir })],
        server: {
            port: 3200,
            strictPort: true,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, ""),
                },
            },
        },
        build: { outDir: "../dist", emptyOutDir: true },
    };
});
