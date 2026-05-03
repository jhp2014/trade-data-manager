import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as marketSchema from "@trade-data-manager/market-data";
import * as featureMarketSchema from "./market-feature/schema";
import * as userSchema from "./user-data/schema";

const featureSchema = { ...featureMarketSchema, ...userSchema };

export function createDb(pool: Pool) {
    return drizzle(pool, {
        schema: { ...marketSchema, ...featureSchema },
    });
}

export type Database = ReturnType<typeof createDb>;

// 라이브러리 export
export * from "./market-feature/types";
export * from "./market-feature/helpers";
export * from "./market-feature/constants";
export * from "./market-feature/schema";
export { MINUTE_CALCULATORS } from "./market-feature/calculators";
export { runMinuteFeatures } from "./market-feature/runner";
export type { MinuteRunnerOptions } from "./market-feature/runner";
export { getAllTradeDates, getPendingTradeDates } from "./market-feature/repository";

export * from "./user-data/schema";
