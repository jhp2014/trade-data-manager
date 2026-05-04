// packages/feature-engine/src/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as marketSchema from "@trade-data-manager/market-data";
import * as featureMarketSchema from "./market-feature/schema";

export function createDb(pool: Pool) {
    return drizzle(pool, {
        schema: { ...marketSchema, ...featureMarketSchema },
    });
}

export type Database = ReturnType<typeof createDb>;

// market-feature 도메인 export
export * from "./market-feature/types";
export * from "./market-feature/helpers";
export * from "./market-feature/constants";
export * from "./market-feature/schema";
export { MINUTE_CALCULATORS } from "./market-feature/calculators";
export { runMinuteFeatures } from "./market-feature/runner";
export type { MinuteRunnerOptions } from "./market-feature/runner";
export { getAllTradeDates, getPendingTradeDates } from "./market-feature/repository";

// deck 도메인 export
export * from "./deck";
