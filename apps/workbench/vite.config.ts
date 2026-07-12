import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발땐 /api → Nest(apps/api, :3001) 로 프록시해 CORS 를 우회한다.
// 프론트는 정적빌드(dist/) 지향 — 배포시 nginx 가 정적 서빙 + /api 는 Nest 로 프록시.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3100,
        proxy: {
            "/api": {
                target: "http://localhost:3001",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
            // 실시간 백엔드(apps/live, :3002) — SSE /live/stream · 폴백 /live/snapshot
            "/live": {
                target: "http://localhost:3002",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/live/, ""),
            },
        },
    },
});
