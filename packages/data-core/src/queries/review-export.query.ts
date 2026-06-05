import { and, asc, desc, gte, inArray } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import type { Database } from "../db";
import { type ReviewExportRow } from "../review-sheet";
import type { ReviewLoadKey } from "../repositories/review-target.repository";
import { buildFeaturesByKey, featureKey } from "./_review-features";

/**
 * 시트 익스포트용 행(타깃 × 포인트 평탄화 + feature/payload 동봉)을 조회한다.
 * - keys 가 주어지면 작업셋(읽기 시트) 범위로, since 가 주어지면 그 날짜 이후로 제한.
 * - 포인트가 없는 타깃도 1행(빈 포인트)으로 내보낸다.
 */
export async function findReviewExportRows(
    db: Database,
    opts: { since?: string; keys?: ReviewLoadKey[] } = {},
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

    const featuresByKey = await buildFeaturesByKey(db, targets, points);
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
            const feature = featuresByKey.get(featureKey(
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
    opts: { since?: string; keys?: ReviewLoadKey[] },
) {
    // keys 가 주어지면 작업셋(읽기 시트) 범위로 제한한다.
    if (opts.keys) {
        if (opts.keys.length === 0) return [];
        const codes = Array.from(new Set(opts.keys.map((k) => k.stockCode)));
        const dates = Array.from(new Set(opts.keys.map((k) => k.tradeDate)));
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
        const wanted = new Set(opts.keys.map((k) => `${k.stockCode}|${k.tradeDate}`));
        return rows.filter((row) => wanted.has(`${row.stockCode}|${row.tradeDate}`));
    }

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
