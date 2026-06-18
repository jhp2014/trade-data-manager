import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as schema from "../db/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

/**
 * 개발용 mock 데이터 공용. data-core(public.review_*)에 넣는 목업 행은
 * source_file 마커로 표시해, 정리 시 실제 데이터를 건드리지 않고 마커 행만 삭제한다.
 */
export const MOCK_MARKER = "MOCK_HYPOTHESIS_LAB";

export type Db = NodePgDatabase<typeof schema>;

export function connect(): { db: Db; close: () => Promise<void> } {
    if (!process.env.DATABASE_URL) {
        throw new Error("[mock] DATABASE_URL is not set (root .env)");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

/** hypothesis 스키마는 전부 비우고, review 목업은 마커 행만 삭제. */
export async function clearMock(db: Db): Promise<void> {
    await db.execute(sql`TRUNCATE TABLE
        "hypothesis"."hypothesis_tags",
        "hypothesis"."hypothesis_cases",
        "hypothesis"."hypothesis_relations",
        "hypothesis"."cases",
        "hypothesis"."hypotheses",
        "hypothesis"."tags"
    RESTART IDENTITY CASCADE`);

    await db.execute(sql`
        DELETE FROM public.review_point
        WHERE review_target_id IN (
            SELECT id FROM public.review_target WHERE source_file = ${MOCK_MARKER}
        )`);
    await db.execute(sql`DELETE FROM public.review_target WHERE source_file = ${MOCK_MARKER}`);
}

export function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
    const maybe = res as { rows?: T[] };
    if (Array.isArray(maybe.rows)) return maybe.rows;
    return Array.isArray(res) ? (res as T[]) : [];
}
