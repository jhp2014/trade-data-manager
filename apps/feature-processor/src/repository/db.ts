import "dotenv/config";
import { Pool } from "pg";
import { createDb } from "@trade-data-manager/feature-engine";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined in .env");
}

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
});

export const db = createDb(pool);
