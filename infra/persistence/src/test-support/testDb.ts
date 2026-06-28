import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema/index.js";
import type { Database } from "../db.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

export interface TestDb {
    db: Database;
    close: () => Promise<void>;
}

/**
 * 인메모리 PGlite(Postgres WASM)에 market 스키마 마이그레이션을 적용한 테스트 DB.
 * Docker/외부서버/실 DATABASE_URL 불필요. node-postgres 기반 Database 로 캐스팅(런타임 동작 동일).
 */
export async function createTestDb(): Promise<TestDb> {
    const client = new PGlite();
    const drz = drizzle(client, { schema });
    await migrate(drz, { migrationsFolder: MIGRATIONS_DIR });
    return {
        db: drz as unknown as Database,
        close: () => client.close(),
    };
}
