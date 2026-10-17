import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 화면은 src/. 시장 읽기 경로(/api/day-flow·dates·stocks/master·chart·news/hts·news/telegram/archive)는
// lab-api 로, 나머지 /api 기본 항목만 tdm api(지금 소비자 0 — 장래 큐레이션 계통용). 이식 경로는 /api 보다
// 먼저 선언한다(선언 순서 매칭) — strangler. 키는 정확 매칭 정규식(^…(\?|$)): 맨 prefix 로 두면 /api/chart 가
// /api/chart-anchors/* 같은 api 잔류 경로까지 삼킨다. (옛 /judgment 프록시는 2026-10-17 judgment 읽기 은퇴로 제거.)
// 포트: 사용(trade-data-manager) 3200 / 개발(tdm-work) 3210(--port 로 올림, launch.json lab-dev).
// 프록시 타겟 기본은 사용 포트(:3001 · :3300) — 개발 워크트리는 .env.local 의 *_PROXY_TARGET 으로 :3011 · :3310 을 가리킨다.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiTarget = env.API_PROXY_TARGET || "http://localhost:3001";
    // lab-api 는 127.0.0.1 에만 붙는다 — localhost(::1 우선)의 IPv4 폴백에 기대지 않게 주소도 IPv4 로.
    const labApiTarget = env.LAB_API_PROXY_TARGET || "http://127.0.0.1:3300";
    const stripApi = (path: string) => path.replace(/^\/api/, "");
    return {
        plugins: [react()],
        server: {
            port: 3200,
            strictPort: true,
            proxy: {
                "^/api/day-flow(\\?|$)": {
                    target: labApiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
                "^/api/dates(\\?|$)": {
                    target: labApiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
                "^/api/chart(\\?|$)": {
                    target: labApiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
                "^/api/stocks/master(\\?|$)": {
                    target: labApiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
                // news 하위도 경로 단위 정확 분기 — 라이브 /news/telegram(검색)은 api 에 남는다.
                "^/api/news/hts(\\?|$)": {
                    target: labApiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
                "^/api/news/telegram/archive(\\?|$)": {
                    target: labApiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    rewrite: stripApi,
                },
            },
        },
    };
});
