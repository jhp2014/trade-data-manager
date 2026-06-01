import { Pool } from "pg";
import { config } from "dotenv";
import { createDb, type Database } from "@trade-data-manager/data-core";

config({ path: "../../.env" });

export function getDb(): Database {
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "[chart-review] DATABASE_URL is not set. " +
            "Add it to the root .env file."
        );
    }
    if (!globalThis.__chartReviewDbPool) {
        globalThis.__chartReviewDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 30,
            idleTimeoutMillis: 30000,
        });
    }
    return createDb(globalThis.__chartReviewDbPool);
}

export async function closeDb(): Promise<void> {
    if (globalThis.__chartReviewDbPool) {
        await globalThis.__chartReviewDbPool.end();
        globalThis.__chartReviewDbPool = undefined;
    }
}
