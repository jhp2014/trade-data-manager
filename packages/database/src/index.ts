import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import "dotenv/config";

// 데이터베이스 연결 풀 설정
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });
export { pool, schema };
export * from "./schema";
