import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        include: ["web/src/**/*.test.ts", "web/src/**/*.test.tsx", "server/**/*.test.ts"],
        setupFiles: ["web/src/test/setup.ts"],
    },
});
