import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { reviewTargets } from "../schema/review";
import type { Database, DbClient } from "../db";

export type ReviewTargetSeed = {
    stockCode: string;
    tradeDate: string;
    stockName?: string;
    lineTargets: number[];
    sourceFile?: string;
};

/** (stockCode, tradeDate) 좌표 키. 로드/익스포트 범위 지정에 공통으로 쓴다. */
export type ReviewLoadKey = { stockCode: string; tradeDate: string };

/**
 * 정확한 (stockCode, tradeDate) 쌍 집합에 해당하는 타깃을 조회한다.
 * - code/date 를 각각 IN 으로 좁혀 받은 뒤(=카르테시안 과적재) JS 에서 쌍으로 정확히 필터한다.
 * - load/export 쿼리가 작업셋(읽기 시트) 범위를 동일하게 좁히는 데 공통으로 쓴다.
 */
export async function findReviewTargetsByKeys(
    db: DbClient,
    keys: ReviewLoadKey[],
): Promise<Array<typeof reviewTargets.$inferSelect>> {
    if (keys.length === 0) return [];

    const codes = Array.from(new Set(keys.map((k) => k.stockCode)));
    const dates = Array.from(new Set(keys.map((k) => k.tradeDate)));
    const rows = await db
        .select()
        .from(reviewTargets)
        .where(
            and(
                inArray(reviewTargets.stockCode, codes),
                inArray(reviewTargets.tradeDate, dates),
            ),
        )
        .orderBy(desc(reviewTargets.tradeDate), asc(reviewTargets.stockCode));

    const wanted = new Set(keys.map((k) => `${k.stockCode}|${k.tradeDate}`));
    return rows.filter((row) => wanted.has(`${row.stockCode}|${row.tradeDate}`));
}

export async function findReviewTargetIdByKey(
    db: DbClient,
    key: ReviewLoadKey,
): Promise<bigint | null> {
    const [target] = await db
        .select({ id: reviewTargets.id })
        .from(reviewTargets)
        .where(
            and(
                eq(reviewTargets.stockCode, key.stockCode),
                eq(reviewTargets.tradeDate, key.tradeDate),
            ),
        )
        .limit(1);
    return target?.id ?? null;
}

export async function upsertReviewTargets(
    db: Database,
    rows: ReviewTargetSeed[],
): Promise<void> {
    if (rows.length === 0) return;

    await db
        .insert(reviewTargets)
        .values(rows)
        .onConflictDoUpdate({
            target: [reviewTargets.stockCode, reviewTargets.tradeDate],
            set: {
                stockName: sql`EXCLUDED.stock_name`,
                lineTargets: sql`EXCLUDED.line_targets`,
                sourceFile: sql`EXCLUDED.source_file`,
                updatedAt: sql`NOW()`,
            },
        });
}

export async function getOrCreateReviewTargetId(
    db: Database,
    target: ReviewTargetSeed,
): Promise<bigint> {
    const [row] = await db
        .insert(reviewTargets)
        .values(target)
        .onConflictDoUpdate({
            target: [reviewTargets.stockCode, reviewTargets.tradeDate],
            set: {
                stockName: sql`EXCLUDED.stock_name`,
                lineTargets: sql`EXCLUDED.line_targets`,
                sourceFile: sql`EXCLUDED.source_file`,
                updatedAt: sql`NOW()`,
            },
        })
        .returning({ id: reviewTargets.id });

    if (!row) {
        throw new Error(
            `[review-target.repository] Failed to upsert review target stockCode=${target.stockCode}, tradeDate=${target.tradeDate}`,
        );
    }
    return row.id;
}
