import { Pool } from "pg";
import { createDb, type Database } from "@trade-data-manager/data-core";

export function getDataViewDb(): Database {
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "[data-view] DATABASE_URL is not set. " +
            "Add it to the root .env file."
        );
    }
    if (!globalThis.__dataViewDbPool) {
        globalThis.__dataViewDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 30,
            idleTimeoutMillis: 30000,
        });
    }
    return createDb(globalThis.__dataViewDbPool);
}
