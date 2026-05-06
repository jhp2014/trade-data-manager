import { sql, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * ON CONFLICT DO UPDATE 의 SET 절을 자동 생성합니다.
 *
 *  - 기본 동작: 모든 컬럼을 EXCLUDED.<col_name> 으로 갱신
 *  - excludeKeys: PK, 유니크 키 등 갱신에서 제외할 컬럼명 (스키마 키 기준)
 *  - updatedAt: 자동으로 NOW() 로 갱신 (트리거 없이도 일관성 유지)
 *
 * 제네릭 T 를 사용해 excludeKeys 인자가 컴파일 타임에 검증됩니다.
 */
export function buildConflictUpdateSet<T extends PgTable>(
    table: T,
    excludeKeys: ReadonlyArray<keyof T["_"]["columns"]> = [],
) {
    const allColumns = getTableColumns(table);
    const setParams: Record<string, any> = {};

    for (const [key, column] of Object.entries(allColumns)) {
        if ((excludeKeys as ReadonlyArray<string>).includes(key)) continue;

        const dbColName = (column as { name: string }).name;

        if (key === "updatedAt") {
            setParams[key] = sql`NOW()`;
        } else {
            setParams[key] = sql.raw(`EXCLUDED.${dbColName}`);
        }
    }
    return setParams;
}
