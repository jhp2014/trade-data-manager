import { asc, eq, isNull } from "drizzle-orm";
import { minuteCandles } from "../schema/market";
import { minuteCandleFeatures } from "../schema/features";
import type { Database } from "../db";

// ── Feature processor read models ───────────────────────────────────

/** 분봉이 존재하는 모든 거래일 (ASC). */
export async function findAllTradeDates(db: Database) {
    const rows = await db
        .selectDistinct({ tradeDate: minuteCandles.tradeDate })
        .from(minuteCandles)
        .orderBy(asc(minuteCandles.tradeDate));
    return rows.map((r) => r.tradeDate);
}

/**
 * 피처가 아직 계산되지 않은 거래일 (ASC).
 * minute_candles LEFT JOIN minute_candle_features 로 features 가 없는 (IS NULL) 행만.
 */
export async function findPendingTradeDates(db: Database) {
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
