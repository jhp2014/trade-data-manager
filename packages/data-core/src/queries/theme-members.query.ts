import { and, eq, inArray } from "drizzle-orm";
import { dailyCandles, dailyThemeMappings } from "../schema/market";
import type { Database } from "../db";

// ── Theme bundle read helpers ────────────────────────────────────────

/**
 * 테마 ID 목록 → 각 테마의 멤버 종목코드들 (themeId 문자열 → stockCode[]).
 * selfCode 는 차트 번들 UX invariant 로 항상 포함한다.
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
