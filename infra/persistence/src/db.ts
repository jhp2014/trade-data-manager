import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";
import { getDatabaseUrl, getCurationDatabaseUrl } from "./env.js";

export function createDb(pool: Pool) {
    return drizzle(pool, { schema });
}

/** 자급 .env(infra/db/.env)의 DATABASE_URL 로 Pool 생성. 앱이 직접 풀을 주입하지 않을 때. */
export function createPoolFromEnv(): Pool {
    return new Pool({ connectionString: getDatabaseUrl() });
}

/** curation 스키마용 Pool. CURATION_DATABASE_URL(없으면 DATABASE_URL 폴백)로 생성 — env.getCurationDatabaseUrl 참조. */
export function createCurationPoolFromEnv(): Pool {
    return new Pool({ connectionString: getCurationDatabaseUrl() });
}

export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbClient = Database | Transaction;
