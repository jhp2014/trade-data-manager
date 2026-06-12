import { and, asc, eq, inArray } from "drizzle-orm";
import {
    themes,
    dailyCandles,
    dailyThemeMappings,
} from "../schema/market";
import type { Database } from "../db";

/**
 * 특정 종목/거래일에 매핑된 테마들을 조회.
 *  - JOIN 없이 3단계 쿼리로 분리해 가독성 ↑
 *  - 비어있을 수 있음. 호출부에서 invariant 위반으로 throw 할지 결정.
 */
export async function findThemesByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
) {
    // 1) dailyCandle id
    const candle = await db.query.dailyCandles.findFirst({
        columns: { id: true },
        where: and(
            eq(dailyCandles.stockCode, params.stockCode),
            eq(dailyCandles.tradeDate, params.tradeDate),
        ),
    });
    if (!candle) return [];

    // 2) 매핑된 themeId 목록
    const mappings = await db
        .select({ themeId: dailyThemeMappings.themeId })
        .from(dailyThemeMappings)
        .where(eq(dailyThemeMappings.dailyCandleId, candle.id));

    if (mappings.length === 0) return [];

    // 3) themes
    return db
        .select()
        .from(themes)
        .where(inArray(themes.themeId, mappings.map((m) => m.themeId)))
        .orderBy(asc(themes.themeName));
}

/**
 * 테마 ID 를 upsert 하고 id 반환.
 */
export async function saveThemeAndReturnId(
    db: Database,
    themeName: string,
): Promise<bigint> {
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
 * 특정 종목/거래일의 테마 매핑 전체 삭제.
 * 배치 재실행 시 기존 테마를 교체하기 위해 사용.
 */
export async function deleteThemeMappingsByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
): Promise<void> {
    const candle = await db.query.dailyCandles.findFirst({
        columns: { id: true },
        where: and(
            eq(dailyCandles.stockCode, params.stockCode),
            eq(dailyCandles.tradeDate, params.tradeDate),
        ),
    });
    if (!candle) return;

    await db
        .delete(dailyThemeMappings)
        .where(eq(dailyThemeMappings.dailyCandleId, candle.id));
}

/**
 * 테마-캔들 매핑. 중복은 무시.
 */
export async function saveThemeMapping(
    db: Database,
    themeId: bigint,
    dailyCandleId: bigint,
): Promise<void> {
    await db
        .insert(dailyThemeMappings)
        .values({ themeId, dailyCandleId })
        .onConflictDoNothing();
}
