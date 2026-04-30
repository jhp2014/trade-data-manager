import { db, dailyCandles, dailyThemeMappings, minuteCandles, stocks, themes } from "@trade-data-manager/database";
import type { DailyCandleInsert, MinuteCandleInsert, StockInsert } from "@trade-data-manager/database";
import { eq, and, sql, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * ON CONFLICT DO UPDATE 의 SET 절을 자동 생성합니다.
 *
 *  - 기본 동작: 모든 컬럼을 EXCLUDED.<col_name> 으로 갱신
 *  - excludeKeys: PK, 유니크 키 등 갱신에서 제외할 컬럼명 (스키마 키 기준)
 *  - updatedAt: 자동으로 NOW() 로 갱신 (트리거 없이도 일관성 유지)
 *
 * 제네릭 T를 사용해 excludeKeys 인자가 컴파일 타임에 검증됩니다.
 *  → 컬럼명 오타 / 스키마 변경 시 즉시 타입 에러 발생.
 */
function buildConflictUpdateSet<T extends PgTable>(
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

// ============================================================
// stocks
// ============================================================

/**
 * 종목 정보를 저장합니다. 이미 존재하면 갱신합니다.
 */
export async function saveStock(data: StockInsert): Promise<void> {
    await db
        .insert(stocks)
        .values(data)
        .onConflictDoUpdate({
            target: stocks.stockCode,
            set: buildConflictUpdateSet(stocks, ["stockCode"]),
        });
}

/**
 * 종목의 상장일을 API 포맷('YYYYMMDD')으로 조회합니다.
 *  - 매핑된 row가 없거나 regDay가 null이면 null 반환
 */
export async function findStockRegDayAsApiFormat(stockCode: string) {
    const row = await db.query.stocks.findFirst({
        columns: { regDay: true },
        where: eq(stocks.stockCode, stockCode),
    });
    return row?.regDay?.replace(/-/g, "") ?? null;
}

// ============================================================
// dailyCandles
// ============================================================

/**
 * 일봉 데이터를 저장합니다. 이미 존재하면 갱신합니다.
 */
export async function saveDailyCandles(rows: DailyCandleInsert[]): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(dailyCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [dailyCandles.tradeDate, dailyCandles.stockCode],
            set: buildConflictUpdateSet(dailyCandles, ["id", "tradeDate", "stockCode"]),
        });
}

/**
 * 일봉을 조회합니다. 분봉 저장 시 FK(id) 및 prevClose를 확보하는 데 사용합니다.
 *  - 반환 타입은 Drizzle이 columns 옵션을 기반으로 자동 추론 (schema drift safe)
 */
export async function findDailyCandle(stockCode: string, tradeDate: string) {
    return db.query.dailyCandles.findFirst({
        where: and(
            eq(dailyCandles.stockCode, stockCode),
            eq(dailyCandles.tradeDate, tradeDate),
        ),
        columns: { id: true, prevCloseKrx: true, prevCloseNxt: true },
    });
}

// ============================================================
// minuteCandles
// ============================================================

/**
 * 분봉 데이터를 저장합니다. 이미 존재하면 갱신합니다.
 */
export async function saveMinuteCandles(rows: MinuteCandleInsert[]): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(minuteCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [minuteCandles.stockCode, minuteCandles.tradeDate, minuteCandles.tradeTime],
            set: buildConflictUpdateSet(minuteCandles, ["id", "stockCode", "tradeDate", "tradeTime"]),
        });
}

// ============================================================
// themes / dailyThemeMappings
// ============================================================

/**
 * 테마를 저장하고 ID를 반환합니다.
 *
 *  ⚠️ onConflictDoNothing + returning 조합은 충돌 시 빈 배열을 반환하므로,
 *      "있으면 그대로 두되 id는 항상 받아오기" 위해 no-op UPDATE 패턴을 사용합니다.
 *      (PostgreSQL upsert + returning의 표준 관용구)
 */
export async function saveTheme(themeName: string): Promise<bigint> {
    const result = await db
        .insert(themes)
        .values({ themeName })
        .onConflictDoUpdate({
            target: themes.themeName,
            set: { themeName },
        })
        .returning({ id: themes.themeId });

    return result[0].id;
}

/**
 * 일봉-테마 매핑을 저장합니다. 이미 존재하면 무시합니다.
 */
export async function saveThemeMapping(
    themeId: bigint,
    dailyCandleId: bigint,
): Promise<void> {
    await db
        .insert(dailyThemeMappings)
        .values({ themeId, dailyCandleId })
        .onConflictDoNothing();
}
