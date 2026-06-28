import { sql, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * ON CONFLICT DO UPDATE 의 SET 절 자동 생성 — 모든 컬럼을 EXCLUDED.<col> 으로 갱신.
 * excludeKeys = PK/자연키 등 갱신 제외 컬럼(스키마 키 기준, 컴파일타임 검증).
 */
export function buildConflictUpdateSet<T extends PgTable>(
    table: T,
    excludeKeys: ReadonlyArray<keyof T["_"]["columns"]> = [],
) {
    const allColumns = getTableColumns(table);
    const setParams: Record<string, ReturnType<typeof sql.raw>> = {};
    for (const [key, column] of Object.entries(allColumns)) {
        if ((excludeKeys as ReadonlyArray<string>).includes(key)) continue;
        const dbColName = (column as { name: string }).name;
        setParams[key] = sql.raw(`EXCLUDED.${dbColName}`);
    }
    return setParams;
}
