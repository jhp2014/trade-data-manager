import { defineConfig } from "drizzle-kit";

// market 스키마(전용 Postgres namespace) — 레거시 public(data-core)과 격리.
export default defineConfig({
    schema: "./src/schema/index.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
