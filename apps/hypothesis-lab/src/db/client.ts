import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "dotenv";
import * as schema from "./schema";

config({ path: "../../.env" });

declare global {
    // eslint-disable-next-line no-var
    var __hypothesisLabPool: Pool | undefined;
}

/**
 * data-core 와 같은 DB 인스턴스를 가리키되, 이 앱은 'hypothesis' schema 의
 * 테이블만 사용한다. data-core 의 createDb 를 재사용하지 않고 자체 schema 로 연결한다.
 */
export function getDb() {
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "[hypothesis-lab] DATABASE_URL is not set. Add it to the root .env file.",
        );
    }
    if (!globalThis.__hypothesisLabPool) {
        globalThis.__hypothesisLabPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30000,
        });
    }
    return drizzle(globalThis.__hypothesisLabPool, { schema });
}

export type Database = ReturnType<typeof getDb>;

export async function closeDb(): Promise<void> {
    if (globalThis.__hypothesisLabPool) {
        await globalThis.__hypothesisLabPool.end();
        globalThis.__hypothesisLabPool = undefined;
    }
}
