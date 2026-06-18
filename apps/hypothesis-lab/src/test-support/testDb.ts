import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Database } from "@/db/client";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

export type TestDb = {
    db: Database;
    close: () => Promise<void>;
};

/**
 * 인메모리 PGlite(Postgres WASM)에 hypothesis 스키마 마이그레이션을 적용한 테스트 DB.
 * 실 DATABASE_URL/외부 서버 불필요. node-postgres 기반 Database 로 캐스팅한다
 * (drizzle 빌더 런타임 동작이 두 드라이버에서 동일).
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

/** 테스트 간 격리: 모든 hypothesis 테이블 비우고 serial 초기화. */
export async function resetHypothesisTables(db: Database): Promise<void> {
    await db.execute(
        sql`TRUNCATE TABLE
            "hypothesis"."hypothesis_tags",
            "hypothesis"."hypothesis_cases",
            "hypothesis"."hypothesis_relations",
            "hypothesis"."cases",
            "hypothesis"."hypotheses",
            "hypothesis"."tags"
        RESTART IDENTITY CASCADE`,
    );
}
