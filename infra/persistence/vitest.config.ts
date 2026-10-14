import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
        // beforeAll/beforeEach 의 createTestDb = PGlite WASM + 마이그 16개(+pg_trgm) — 혼자면 2~4s 지만
        // 11개 파일이 병렬로 돌면 기본 10s 를 넘긴다(2026-10-14 0015 추가 후 실측). 행 자체는 안 매달린다.
        hookTimeout: 60_000,
    },
});
