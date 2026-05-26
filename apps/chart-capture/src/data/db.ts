import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), "../../.env") });
import { Pool } from "pg";
import { createDb, type Database } from "@trade-data-manager/data-core";

export function getCaptureDb(): Database {
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "[chart-capture] DATABASE_URL is not set. " +
            "Add it to the root .env file.",
        );
    }
    if (!globalThis.__captureDbPool) {
        globalThis.__captureDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30000,
        });
    }
    return createDb(globalThis.__captureDbPool);
}

export async function closeCaptureDb(): Promise<void> {
    if (globalThis.__captureDbPool) {
        await globalThis.__captureDbPool.end();
        globalThis.__captureDbPool = undefined;
    }
}
