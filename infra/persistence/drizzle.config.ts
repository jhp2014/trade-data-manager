import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 자급 .env(패키지 로컬). 레거시 public 과 같은 DB 인스턴스, 스키마만 `market`.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

export default defineConfig({
    schema: "./src/schema/index.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL! },
    // 같은 DB 의 data-core(public)·hypothesis 스키마를 절대 건드리지 않도록 push/introspection 범위를 우리 스키마로 제한.
    schemaFilter: ["market", "curation"],
});
