import { and, asc, eq, inArray } from "drizzle-orm";
import {
    themes,
    dailyCandles,
    dailyThemeMappings,
} from "../schema/market";
import type { Database } from "../db";

export interface ThemeInfo {
    themeId: string;
    themeName: string;
}

/**
 * 특정 종목이 해당 거래일에 속한 테마 목록.
 * 매핑이 없으면 가짜 테마 [{ themeId: "", themeName: "(테마 없음)" }] 를 반환합니다.
 */
export async function findThemesByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
): Promise<ThemeInfo[]> {
    const rows = await db
        .selectDistinct({
            themeId: themes.themeId,
            themeName: themes.themeName,
        })
        .from(dailyCandles)
        .innerJoin(
            dailyThemeMappings,
            eq(dailyThemeMappings.dailyCandleId, dailyCandles.id),
        )
        .innerJoin(themes, eq(themes.themeId, dailyThemeMappings.themeId))
        .where(
            and(
                eq(dailyCandles.stockCode, params.stockCode),
                eq(dailyCandles.tradeDate, params.tradeDate),
            ),
        )
        .orderBy(asc(themes.themeName));

    if (rows.length === 0) {
        return [{ themeId: "", themeName: "(테마 없음)" }];
    }
    return rows.map((r) => ({
        themeId: String(r.themeId),
        themeName: r.themeName,
    }));
}

/**
 * 테마 ID 목록에 해당 거래일에 속한 종목 코드 맵 (themeId → stockCode[]).
 * selfCode 가 누락된 테마에는 방어적으로 추가합니다.
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

    // schema 에서 themeId 는 bigint 라 string -> bigint 변환 필요
    const realIdsBigint = realIds.map((id) => BigInt(id));

    const rows = await db
        .selectDistinct({
            themeId: dailyThemeMappings.themeId,
            stockCode: dailyCandles.stockCode,
        })
        .from(dailyThemeMappings)
        .innerJoin(
            dailyCandles,
            eq(dailyCandles.id, dailyThemeMappings.dailyCandleId),
        )
        .where(
            and(
                inArray(dailyThemeMappings.themeId, realIdsBigint),
                eq(dailyCandles.tradeDate, tradeDate),
            ),
        );

    const map = new Map<string, string[]>();
    for (const r of rows) {
        const tid = String(r.themeId);
        const arr = map.get(tid) ?? [];
        arr.push(r.stockCode);
        map.set(tid, arr);
    }
    for (const id of realIds) {
        const arr = map.get(id) ?? [];
        if (!arr.includes(selfCode)) arr.push(selfCode);
        map.set(id, arr);
    }
    return map;
}

/**
 * 테마를 저장하고 ID 를 반환합니다.
 *
 *  ⚠️ onConflictDoNothing + returning 조합은 충돌 시 빈 배열을 반환하므로,
 *      "있으면 그대로 두되 id 는 항상 받아오기" 위해 no-op UPDATE 패턴을 사용합니다.
 *      (PostgreSQL upsert + returning 의 표준 관용구)
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
 * 일봉-테마 매핑을 저장합니다. 이미 존재하면 무시합니다.
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
