import { asc, desc } from "drizzle-orm";
import { reviewTargets } from "../schema/review";
import type { Database } from "../db";
import {
    findReviewTargetsByKeys,
    type ReviewLoadKey,
} from "../repositories/review-target.repository";
import { findPointsByTargetIds } from "../repositories/review-point.repository";
import { buildFeaturesByKey, featureKey } from "./_review-features";

// ── 앱 로드용 read (DB → 작업셋) ────────────────────────────────────

export type ReviewLoadPoint = {
    reviewId: string;
    tradeTime: string;
    payload: Record<string, string | string[]>;
    features: Record<string, string | null>;
};

export type ReviewLoadTarget = {
    stockCode: string;
    stockName: string | null;
    tradeDate: string;
    lineTargets: number[];
    points: ReviewLoadPoint[];
};

/**
 * 앱 사이드바/Point List 가 그릴 작업셋을 DB 에서 로드한다.
 * - keys 가 주어지면 해당 (stockCode, tradeDate) 타깃만, 없으면 전체(최근순).
 * - 각 타깃의 모든 Point + payload(m_) + minute_candle_features(feature) 포함.
 */
export async function findReviewLoadTargets(
    db: Database,
    opts: { keys?: ReviewLoadKey[]; limit?: number } = {},
): Promise<ReviewLoadTarget[]> {
    const targets = await loadTargets(db, opts);
    if (targets.length === 0) return [];

    const pointsByTargetId = await findPointsByTargetIds(
        db,
        targets.map((target) => target.id),
    );
    const allPoints = Array.from(pointsByTargetId.values()).flat();

    const featuresByKey = await buildFeaturesByKey(db, targets, allPoints);

    return targets.map((target) => ({
        stockCode: target.stockCode,
        stockName: target.stockName ?? null,
        tradeDate: target.tradeDate,
        lineTargets: target.lineTargets,
        points: (pointsByTargetId.get(target.id) ?? []).map((point) => ({
            reviewId: point.id.toString(),
            tradeTime: point.tradeTime,
            payload: point.payloadJson,
            features:
                featuresByKey.get(
                    featureKey(target.stockCode, target.tradeDate, point.tradeTime),
                ) ?? {},
        })),
    }));
}

async function loadTargets(
    db: Database,
    opts: { keys?: ReviewLoadKey[]; limit?: number },
): Promise<Array<typeof reviewTargets.$inferSelect>> {
    const keys = opts.keys;
    // keys 가 주어지면(빈 배열 포함) 정확한 (code, date) 쌍 범위로 제한.
    if (keys) return findReviewTargetsByKeys(db, keys);

    const query = db
        .select()
        .from(reviewTargets)
        .orderBy(desc(reviewTargets.tradeDate), asc(reviewTargets.stockCode));

    return opts.limit ? query.limit(opts.limit) : query;
}
