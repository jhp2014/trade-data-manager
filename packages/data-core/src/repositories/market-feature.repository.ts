import { asc, eq, isNull, and, inArray } from "drizzle-orm";
import { minuteCandles } from "../schema/market";
import {
    minuteCandleFeatures,
    type MinuteCandleFeatures,
    type MinuteCandleFeaturesInsert,
} from "../schema/features";
import type { Database } from "../db";
import { buildConflictUpdateSet } from "./_helpers";

/**
 * 분봉 피처들을 upsert. (minuteCandleId 기준으로 충돌 시 갱신)
 *  - PostgreSQL wire protocol 의 파라미터 한계 (~65535) 회피를 위해
 *    500개씩 청크로 잘라 INSERT.
 */
export async function saveMinuteFeatures(
    db: Database,
    rows: MinuteCandleFeaturesInsert[],
): Promise<void> {
    if (rows.length === 0) return;

    const updateSet = buildConflictUpdateSet(minuteCandleFeatures, [
        "id",
        "minuteCandleId",
        "dailyCandleId",
        "createdAt",
    ]);
    const CHUNK_SIZE = 500;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        await db
            .insert(minuteCandleFeatures)
            .values(chunk)
            .onConflictDoUpdate({
                target: minuteCandleFeatures.minuteCandleId,
                set: updateSet,
            });
    }
}

/**
 * 분봉이 존재하는 모든 거래일 (ASC).
 */
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

/** 단일 시점 (date, time) 의 features (stockCode → row) */
export async function findFeaturesAt(
    db: Database,
    params: { stockCodes: string[]; tradeDate: string; tradeTime: string },
): Promise<Map<string, MinuteCandleFeatures>> {
    const { stockCodes, tradeDate, tradeTime } = params;
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select()
        .from(minuteCandleFeatures)
        .where(
            and(
                inArray(minuteCandleFeatures.stockCode, stockCodes),
                eq(minuteCandleFeatures.tradeDate, tradeDate),
                eq(minuteCandleFeatures.tradeTime, tradeTime),
            ),
        );

    const map = new Map<string, MinuteCandleFeatures>();
    for (const r of rows) map.set(r.stockCode, r);
    return map;
}

/** 하루치 features 시계열 (stockCode → rows, tradeTime ASC) */
export async function findFeaturesByCodesAndDate(
    db: Database,
    params: { stockCodes: string[]; tradeDate: string },
): Promise<Map<string, MinuteCandleFeatures[]>> {
    const { stockCodes, tradeDate } = params;
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select()
        .from(minuteCandleFeatures)
        .where(
            and(
                inArray(minuteCandleFeatures.stockCode, stockCodes),
                eq(minuteCandleFeatures.tradeDate, tradeDate),
            ),
        )
        .orderBy(
            asc(minuteCandleFeatures.stockCode),
            asc(minuteCandleFeatures.tradeTime),
        );

    const map = new Map<string, MinuteCandleFeatures[]>();
    for (const r of rows) {
        const arr = map.get(r.stockCode) ?? [];
        arr.push(r);
        map.set(r.stockCode, arr);
    }
    return map;
}
