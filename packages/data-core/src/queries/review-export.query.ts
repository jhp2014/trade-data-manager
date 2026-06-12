import { asc, desc, gte } from "drizzle-orm";
import { reviewTargets } from "../schema/review";
import type { Database } from "../db";
import {
    findReviewTargetsByKeys,
    type ReviewLoadKey,
} from "../repositories/review-target.repository";
import { findPointsByTargetIds } from "../repositories/review-point.repository";
import { buildFeaturesByKey, featureKey } from "./_review-features";

/**
 * Sheet export 1행의 원천 데이터(타깃 × 타점 평탄화 + feature/payload 동봉).
 * DB 조회 계약이라 data-core 가 소유하고, Sheet matrix 변환은 앱(chart-review)이 담당한다.
 */
export type ReviewExportRow = {
    reviewId: string | null;
    stockCode: string;
    stockName: string | null;
    tradeDate: string;
    tradeTime: string | null;
    lineTargets: number[];
    features: Record<string, string | null>;
    payload: Record<string, string | string[]>;
};

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

    const pointsByTargetId = await findPointsByTargetIds(
        db,
        targets.map((target) => target.id),
    );
    const allPoints = Array.from(pointsByTargetId.values()).flat();

    const featuresByKey = await buildFeaturesByKey(db, targets, allPoints);
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
    if (opts.keys) return findReviewTargetsByKeys(db, opts.keys);

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
