import "dotenv/config";
import { Pool } from "pg";
import { createDb, type Database } from "@trade-data-manager/feature-engine";

const globalForDb = globalThis as unknown as {
    __dataViewDbPool?: Pool;
};

export function getDataViewDb(): Database {
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "[data-view] DATABASE_URL is not set. " +
            "Add it to apps/data-view/.env.local"
        );
    }
    if (!globalForDb.__dataViewDbPool) {
        globalForDb.__dataViewDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30000,
        });
    }
    return createDb(globalForDb.__dataViewDbPool);
}
