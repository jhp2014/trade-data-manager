import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema/index.js";
import type { Database } from "../db.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));
const CURATION_DIR = fileURLToPath(new URL("../../drizzle/curation", import.meta.url));

export interface TestDb {
    db: Database;
    close: () => Promise<void>;
}

/**
 * 인메모리 PGlite(Postgres WASM)에 스키마 마이그레이션을 적용한 테스트 DB.
 * Docker/외부서버/실 DATABASE_URL 불필요. node-postgres 기반 Database 로 캐스팅(런타임 동작 동일).
 *
 * 2-스트림 반영: 메인 `drizzle/`(market + curation 통합이력, 분리 시점까지) + curation 증분(0001+).
 * curation 베이스라인(0000)은 메인이 이미 커버하므로 건너뛰고, 분리 후 추가된 curation 테이블만 얹는다
 * (실 DB에선 curation 스트림이 Supabase, 로컬은 미러로 받지만 테스트는 한 pglite 에 둘을 합쳐 재현).
 */
export async function createTestDb(): Promise<TestDb> {
    const client = new PGlite();
    const drz = drizzle(client, { schema });
    await migrate(drz, { migrationsFolder: MIGRATIONS_DIR });
    await applyCurationIncrements(client);
    return {
        db: drz as unknown as Database,
        close: () => client.close(),
    };
}

/** curation 스트림의 증분 마이그(idx>=1)만 순서대로 실행. 베이스라인(0000)은 메인 스트림이 이미 만든다. */
async function applyCurationIncrements(client: PGlite): Promise<void> {
    const journalPath = path.join(CURATION_DIR, "meta", "_journal.json");
    if (!fs.existsSync(journalPath)) return;
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { idx: number; tag: string }[] };
    for (const entry of journal.entries) {
        if (entry.idx < 1) continue; // 0000 베이스라인은 메인 통합이력이 커버 — 증분만.
        const sql = fs.readFileSync(path.join(CURATION_DIR, `${entry.tag}.sql`), "utf8");
        await client.exec(sql.replaceAll("--> statement-breakpoint", "\n"));
    }
}
