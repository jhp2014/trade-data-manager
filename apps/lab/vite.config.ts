import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 화면은 src/. 서버는 프록시 둘로 가른다 — /api 는 tdm api(시장 데이터, GET 만), /judgment 는 lab-api(판단 저장소).
// 포트: 사용(trade-data-manager) 3200 / 개발(tdm-work) 3210(--port 로 올림, launch.json lab-dev).
// 프록시 타겟 기본은 사용 포트(:3001 · :3300) — 개발 워크트리는 .env.local 의 *_PROXY_TARGET 으로 :3011 · :3310 을 가리킨다.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiTarget = env.API_PROXY_TARGET || "http://localhost:3001";
    // lab-api 는 127.0.0.1 에만 붙는다 — localhost(::1 우선)의 IPv4 폴백에 기대지 않게 주소도 IPv4 로.
    const judgmentTarget = env.JUDGMENT_PROXY_TARGET || "http://127.0.0.1:3300";
    return {
        plugins: [react()],
        server: {
            port: 3200,
            strictPort: true,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, ""),
                },
                "/judgment": {
                    target: judgmentTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
