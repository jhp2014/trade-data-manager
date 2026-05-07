import { and, eq } from "drizzle-orm";
import { dailyCandles, type DailyCandleInsert } from "../schema/market";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 일봉 데이터를 저장합니다. 이미 존재하면 갱신합니다.
 */
export async function saveDailyCandles(
    db: Database,
    rows: DailyCandleInsert[],
): Promise<void> {
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
 * 일봉을 조회합니다. 분봉 저장 시 FK(id) 및 prevClose 를 확보하는 데 사용합니다.
 *  - 반환 타입은 Drizzle 이 columns 옵션을 기반으로 자동 추론 (schema drift safe)
 */
export async function findDailyCandleByStockAndDate(
    db: Database,
    params: { stockCode: string; tradeDate: string },
) {
    return db.query.dailyCandles.findFirst({
        where: and(
            eq(dailyCandles.stockCode, params.stockCode),
            eq(dailyCandles.tradeDate, params.tradeDate),
        ),
        columns: { id: true, prevCloseKrx: true, prevCloseNxt: true },
    });
}
