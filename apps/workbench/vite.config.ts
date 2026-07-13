import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 개발땐 /api → Nest(apps/api, :3001), /live → apps/live(:3002) 로 프록시해 CORS 를 우회한다.
// 프록시 타겟은 env 로 오버라이드 가능(apps/workbench/.env.local):
//   · API_PROXY_TARGET  (기본 http://localhost:3001) — 보통 로컬 고정
//   · LIVE_PROXY_TARGET (기본 http://localhost:3002) — 호스팅 시 서버 Tailscale IP 로
//     예: LIVE_PROXY_TARGET=http://100.x.x.x:3002  (apps/live 가 iwinv/OCI 에 상주할 때)
// 프론트는 정적빌드(dist/) 지향 — 배포시 nginx 가 정적 서빙 + /api 는 Nest 로 프록시.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), ""); // "" = VITE_ 접두 무관 전체 로드
    const apiTarget = env.API_PROXY_TARGET || "http://localhost:3001";
    const liveTarget = env.LIVE_PROXY_TARGET || "http://localhost:3002";
    return {
        plugins: [react()],
        server: {
            port: 3100,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, ""),
                },
                // 실시간 백엔드(apps/live) — SSE /live/stream · 폴백 /live/snapshot · 알람 REST
                "/live": {
                    target: liveTarget,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/live/, ""),
                },
            },
        },
    };
});
