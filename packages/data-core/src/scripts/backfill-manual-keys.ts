import { Pool } from "pg";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createDb } from "../db";
import { backfillManualKeysFromPayloads } from "../services/review-manual-key.service";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

async function main() {
    if (!process.env.DATABASE_URL?.trim()) {
        throw new Error("[backfill-manual-keys] DATABASE_URL is not set in root .env");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const db = createDb(pool);
        const added = await backfillManualKeysFromPayloads(db);
        if (added.length === 0) {
            console.log("[backfill-manual-keys] 추가할 새 키 없음 (이미 모두 등록됨).");
        } else {
            console.log(`[backfill-manual-keys] ${added.length}개 키 추가: ${added.join(", ")}`);
        }
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
