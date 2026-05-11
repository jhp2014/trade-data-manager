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
 * 테마 ID 목록 → 각 테마의 멤버 종목코드들 (themeId 문자열 → stockCode[]).
 * selfCode 는 항상 포함됨.
 * JOIN 을 풀어 단일 테이블 쿼리 2회로 처리.
 */
export async function findMemberCodesByThemeIds(
    db: Database,
    params: { themeIds: string[]; tradeDate: string; selfCode: string },
): Promise<Map<string, string[]>> {
    const { themeIds, tradeDate, selfCode } = params;
    const realIds = themeIds.filter((id) => id !== "");

    if (realIds.length === 0) {
        return new Map([["", [selfCode]]]);
    }

    const realIdsBigint = realIds.map((id) => BigInt(id));

    // 1) 해당 날짜의 dailyCandle (id, stockCode)
    const candlesOfDate = await db
        .select({ id: dailyCandles.id, stockCode: dailyCandles.stockCode })
        .from(dailyCandles)
        .where(eq(dailyCandles.tradeDate, tradeDate));

    const idToCode = new Map(candlesOfDate.map((c) => [c.id, c.stockCode]));
    const candleIds = candlesOfDate.map((c) => c.id);

    const map = new Map<string, string[]>();

    if (candleIds.length > 0) {
        // 2) 매핑
        const mappings = await db
            .select({
                themeId: dailyThemeMappings.themeId,
                dailyCandleId: dailyThemeMappings.dailyCandleId,
            })
            .from(dailyThemeMappings)
            .where(
                and(
                    inArray(dailyThemeMappings.themeId, realIdsBigint),
                    inArray(dailyThemeMappings.dailyCandleId, candleIds),
                ),
            );

        // 3) 조립
        for (const m of mappings) {
            const tid = String(m.themeId);
            const code = idToCode.get(m.dailyCandleId);
            if (!code) continue;
            const arr = map.get(tid) ?? [];
            if (!arr.includes(code)) arr.push(code);
            map.set(tid, arr);
        }
    }

    // self 보장
    for (const id of realIds) {
        const arr = map.get(id) ?? [];
        if (!arr.includes(selfCode)) arr.push(selfCode);
        map.set(id, arr);
    }
    return map;
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
