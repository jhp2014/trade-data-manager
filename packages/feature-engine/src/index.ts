import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as marketSchema from "@trade-data-manager/market-data";
import * as featureSchema from "./schema";

/**
 * 통합 db 인스턴스 팩토리.
 * - market(raw) + feature(가공) 두 스키마를 모두 인식.
 * - 각 app(진입점)이 자기 Pool을 주입해 자기 db 인스턴스를 소유.
 *
 * @example
 *   // app 측에서:
 *   import { pool } from "@trade-data-manager/market-data";
 *   import { createDb } from "@trade-data-manager/feature-engine";
 *   export const db = createDb(pool);
 */
export function createDb(pool: Pool) {
    return drizzle(pool, {
        schema: { ...marketSchema, ...featureSchema },
    });
}

/**
 * createDb의 반환 타입. Repository 등에서 db 매개변수 타입 지정 시 사용.
 */
export type Database = ReturnType<typeof createDb>;

// 라이브러리 export
export * from "./types";
export * from "./helpers";
export * from "./constants";
export * from "./schema";
export { MINUTE_CALCULATORS } from "./calculators/minute";
export { THEME_FEATURE_CALCULATORS } from "./calculators/theme-feature";
export { THEME_CONTEXT_CALCULATORS } from "./calculators/theme-context";