import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as marketSchema from "@trade-data-manager/market-data";
import * as featureSchema from "./schema";

export function createDb(pool: Pool) {
    return drizzle(pool, {
        schema: { ...marketSchema, ...featureSchema },
    });
}

export type Database = ReturnType<typeof createDb>;

// 라이브러리 export
export * from "./types";
export * from "./helpers";
export * from "./constants";
export * from "./schema";
export { MINUTE_CALCULATORS } from "./calculators/minute";
