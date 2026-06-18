import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
    // 같은 DB의 data-core(public) 테이블을 절대 건드리지 않도록
    // 이 앱이 소유한 'hypothesis' schema 로만 introspection/push 범위를 제한한다.
    schemaFilter: ["hypothesis"],
});
