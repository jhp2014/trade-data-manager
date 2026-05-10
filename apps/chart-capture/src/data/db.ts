import "dotenv/config";
import { Pool } from "pg";
import { createDb, type Database } from "@trade-data-manager/data-core";

const globalForDb = globalThis as unknown as {
    __captureDbPool?: Pool;
};

export function getCaptureDb(): Database {
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "[chart-capture] DATABASE_URL is not set. " +
            "Add it to apps/chart-capture/.env",
        );
    }
    if (!globalForDb.__captureDbPool) {
        globalForDb.__captureDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30000,
        });
    }
    return createDb(globalForDb.__captureDbPool);
}

export async function closeCaptureDb(): Promise<void> {
    if (globalForDb.__captureDbPool) {
        await globalForDb.__captureDbPool.end();
        delete globalForDb.__captureDbPool;
    }
}
