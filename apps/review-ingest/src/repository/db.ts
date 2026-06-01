import { config } from "dotenv";
import { resolve } from "path";
import { Pool } from "pg";
import { createDb, type Database } from "@trade-data-manager/data-core";

config({ path: resolve(process.cwd(), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

const db = createDb(pool);

export function getDb(): Database {
  return db;
}

export function closeDb(): Promise<void> {
  return pool.end();
}
