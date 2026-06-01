import { sql } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import type { Database } from "../db";

export type ReviewTargetSeed = {
    stockCode: string;
    tradeDate: string;
    stockName?: string;
    lineTargets: number[];
    sourceFile?: string;
};

export type ReviewPointSeed = {
    tradeTime: string;
    payloadJson: Record<string, string | string[]>;
};

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
            `[review.repository] Failed to upsert review target stockCode=${target.stockCode}, tradeDate=${target.tradeDate}`,
        );
    }
    return row.id;
}

export async function insertReviewPointIfAbsent(
    db: Database,
    point: { reviewTargetId: bigint } & ReviewPointSeed,
): Promise<void> {
    await db
        .insert(reviewPoints)
        .values(point)
        .onConflictDoNothing({
            target: [reviewPoints.reviewTargetId, reviewPoints.tradeTime],
        });
}
