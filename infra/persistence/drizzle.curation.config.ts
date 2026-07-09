import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// curation 스키마 전용 config — 협업 공유 Supabase 대상. 로컬 market 과 물리 분리(→ deploy 분리 설계).
// market/로컬은 기존 drizzle.config.ts(통합 이력, 동결)가 담당하고, 여긴 curation 만 새 스트림으로 관리한다.
// curation 은 파티션·손SQL 이 없어 drizzle 이 스키마를 완전 표현 → 단일 baseline 이 곧 현행 스키마와 동일.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

export default defineConfig({
    schema: "./src/schema/curation.ts",
    out: "./drizzle/curation",
    dialect: "postgresql",
    // CURATION_DATABASE_URL 은 migrate/push 시 필수 — 폴백 없음(env.ts 의 앱 런타임 폴백과 달리, 실수로 로컬 DB 에
    // curation 마이그레이션을 적용하는 사고를 막는다). generate 는 오프라인(스키마↔스냅샷 diff)이라 URL 없이 동작.
    dbCredentials: { url: process.env.CURATION_DATABASE_URL! },
    schemaFilter: ["curation"],
});
