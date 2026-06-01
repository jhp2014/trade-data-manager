import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import { minuteCandleFeatures } from "../schema/features";
import type { Database } from "../db";
import { FEATURE_COLUMNS, type ReviewExportRow } from "../review-sheet";

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

export async function findReviewExportRows(
    db: Database,
    opts: { since?: string } = {},
): Promise<ReviewExportRow[]> {
    const targets = await findExportTargets(db, opts);
    if (targets.length === 0) return [];

    const targetIds = targets.map((target) => target.id);
    const points = await db
        .select()
        .from(reviewPoints)
        .where(inArray(reviewPoints.reviewTargetId, targetIds))
        .orderBy(asc(reviewPoints.reviewTargetId), asc(reviewPoints.tradeTime));

    const pointsByTargetId = new Map<bigint, typeof points>();
    for (const point of points) {
        const arr = pointsByTargetId.get(point.reviewTargetId) ?? [];
        arr.push(point);
        pointsByTargetId.set(point.reviewTargetId, arr);
    }

    const featuresByKey = await findExportFeatures(db, targets, points);
    const rows: ReviewExportRow[] = [];

    for (const target of targets) {
        const targetPoints = pointsByTargetId.get(target.id) ?? [];
        if (targetPoints.length === 0) {
            rows.push({
                reviewId: null,
                stockCode: target.stockCode,
                stockName: target.stockName ?? null,
                tradeDate: target.tradeDate,
                tradeTime: null,
                lineTargets: target.lineTargets,
                features: {},
                payload: {},
            });
            continue;
        }

        for (const point of targetPoints) {
            const feature = featuresByKey.get(exportFeatureKey(
                target.stockCode,
                target.tradeDate,
                point.tradeTime,
            ));
            rows.push({
                reviewId: point.id.toString(),
                stockCode: target.stockCode,
                stockName: target.stockName ?? null,
                tradeDate: target.tradeDate,
                tradeTime: point.tradeTime,
                lineTargets: target.lineTargets,
                features: feature ?? {},
                payload: point.payloadJson,
            });
        }
    }

    return rows;
}

async function findExportTargets(
    db: Database,
    opts: { since?: string },
) {
    if (opts.since) {
        return db
            .select()
            .from(reviewTargets)
            .where(gte(reviewTargets.tradeDate, opts.since))
            .orderBy(desc(reviewTargets.tradeDate), asc(reviewTargets.stockCode));
    }

    return db
        .select()
        .from(reviewTargets)
        .orderBy(desc(reviewTargets.tradeDate), asc(reviewTargets.stockCode));
}

async function findExportFeatures(
    db: Database,
    targets: Awaited<ReturnType<typeof findExportTargets>>,
    points: Array<typeof reviewPoints.$inferSelect>,
): Promise<Map<string, Record<string, string | null>>> {
    if (points.length === 0) return new Map();

    const targetById = new Map(targets.map((target) => [target.id, target]));
    const dateToCodes = new Map<string, Set<string>>();
    for (const point of points) {
        const target = targetById.get(point.reviewTargetId);
        if (!target) continue;
        const codes = dateToCodes.get(target.tradeDate) ?? new Set<string>();
        codes.add(target.stockCode);
        dateToCodes.set(target.tradeDate, codes);
    }

    const out = new Map<string, Record<string, string | null>>();
    for (const [tradeDate, codes] of dateToCodes.entries()) {
        const rows = await db
            .select()
            .from(minuteCandleFeatures)
            .where(
                and(
                    eq(minuteCandleFeatures.tradeDate, tradeDate),
                    inArray(minuteCandleFeatures.stockCode, Array.from(codes)),
                ),
            );

        for (const row of rows) {
            out.set(
                exportFeatureKey(row.stockCode, row.tradeDate, row.tradeTime),
                pickFeatureColumns(row),
            );
        }
    }

    return out;
}

function pickFeatureColumns(row: Record<string, unknown>): Record<string, string | null> {
    const features: Record<string, string | null> = {};
    for (const column of FEATURE_COLUMNS) {
        features[column] = formatFeatureValue(row[column]);
    }
    return features;
}

function formatFeatureValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
}

function exportFeatureKey(stockCode: string, tradeDate: string, tradeTime: string) {
    return `${stockCode}|${tradeDate}|${tradeTime.slice(0, 8)}`;
}
