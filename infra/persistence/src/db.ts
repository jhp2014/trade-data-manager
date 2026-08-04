import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";
import { getDatabaseUrl, getCurationDatabaseUrl } from "./env.js";

export function createDb(pool: Pool) {
    return drizzle(pool, { schema });
}

/**
 * 유휴 커넥션은 네트워크가 끊기면(노트북 이동·와이파이 전환) ECONNRESET 으로 죽는다.
 * pg 는 그 에러를 Pool 의 'error' 이벤트로 재방출하는데, 리스너가 없으면 Node 가 프로세스를 죽인다.
 * pg 가 이미 깨진 클라이언트를 풀에서 빼낸 뒤라 다음 쿼리가 새 커넥션으로 자가복구한다 — 로그만 남기고 흘려보낸다.
 * keepAlive 는 죽은 소켓을 오래 붙들지 않고 빨리 감지·폐기하게 한다.
 */
function createPool(connectionString: string): Pool {
    const pool = new Pool({ connectionString, keepAlive: true });
    pool.on("error", (err) => console.error("[pg] idle client error (자가복구)", err.message));
    return pool;
}

/** 자급 .env(infra/db/.env)의 DATABASE_URL 로 Pool 생성. 앱이 직접 풀을 주입하지 않을 때. */
export function createPoolFromEnv(): Pool {
    return createPool(getDatabaseUrl());
}

/** curation 스키마용 Pool. 전용 URL(getCurationDatabaseUrl) 없으면 market DB 로 폴백(분리 전 과도기 = 같은 DB, 동일 동작). */
export function createCurationPoolFromEnv(): Pool {
    return createPool(getCurationDatabaseUrl() ?? getDatabaseUrl());
}

export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbClient = Database | Transaction;
