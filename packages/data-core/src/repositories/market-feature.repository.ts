import { asc, eq, isNull, sql, getTableColumns } from "drizzle-orm";
import { minuteCandles } from "../schema/market";
import { minuteCandleFeatures } from "../schema/features";
import type { Database } from "../db";

/**
 * 분봉 피처 행을 일괄 upsert. (minuteCandleId 기준 충돌 시 갱신)
 *  - excluded.* 를 EXCLUDED.<col_name> 으로 매핑
 *  - 청크 단위(500) 로 나누어 INSERT 부담 분산
 */
export async function saveMinuteFeatures(
    db: Database,
    rows: Array<Record<string, any>>,
): Promise<void> {
    if (rows.length === 0) return;

    const updateSet = buildMinuteFeaturesUpdateSet();
    const CHUNK_SIZE = 500;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        await db
            .insert(minuteCandleFeatures)
            .values(chunk as any)
            .onConflictDoUpdate({
                target: minuteCandleFeatures.minuteCandleId,
                set: updateSet,
            });
    }
}

function buildMinuteFeaturesUpdateSet() {
    const columns = getTableColumns(minuteCandleFeatures);
    const excluded = new Set(["id", "minuteCandleId", "dailyCandleId", "createdAt"]);
    const set: Record<string, any> = {};
    for (const [tsKey, col] of Object.entries(columns)) {
        if (excluded.has(tsKey)) continue;
        set[tsKey] = sql.raw(`excluded.${col.name}`);
    }
    set.updatedAt = sql`now()`;
    return set;
}

/**
 * 분봉이 기록된 모든 거래일 (ASC).
 */
export async function findAllTradeDates(db: Database): Promise<string[]> {
    const rows = await db
        .selectDistinct({ tradeDate: minuteCandles.tradeDate })
        .from(minuteCandles)
        .orderBy(asc(minuteCandles.tradeDate));
    return rows.map((r) => r.tradeDate);
}

/**
 * 아직 분봉 피처가 가공되지 않은 거래일 (ASC).
 *  - minute_candles LEFT JOIN minute_candle_features 후 features 가 없는(IS NULL) 거래일.
 */
export async function findPendingTradeDates(db: Database): Promise<string[]> {
    const rows = await db
        .selectDistinct({ tradeDate: minuteCandles.tradeDate })
        .from(minuteCandles)
        .leftJoin(
            minuteCandleFeatures,
            eq(minuteCandleFeatures.minuteCandleId, minuteCandles.id),
        )
        .where(isNull(minuteCandleFeatures.id))
        .orderBy(asc(minuteCandles.tradeDate));

    return rows.map((r) => r.tradeDate);
}
