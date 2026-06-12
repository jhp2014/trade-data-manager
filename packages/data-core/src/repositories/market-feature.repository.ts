import { asc, eq, and, inArray } from "drizzle-orm";
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
