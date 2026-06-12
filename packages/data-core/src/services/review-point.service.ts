import type { Database } from "../db";
import { findReviewTargetIdByKey } from "../repositories/review-target.repository";
import { upsertReviewPointByTargetId } from "../repositories/review-point.repository";

// ── Review point write use cases ─────────────────────────────────────

/**
 * 앱에서 Point 1건을 입력/수정한다.
 * - 대상 Target((stockCode, tradeDate))은 이미 존재해야 한다(Target 생성은 ingest 전용).
 * - (reviewTargetId, tradeTime) 충돌 시 payload 를 덮어쓴다(수정).
 */
export async function upsertReviewPoint(
    db: Database,
    input: {
        stockCode: string;
        tradeDate: string;
        tradeTime: string;
        payload: Record<string, string | string[]>;
    },
): Promise<{ id: string }> {
    return db.transaction(async (tx) => {
        const reviewTargetId = await findReviewTargetIdByKey(tx, {
            stockCode: input.stockCode,
            tradeDate: input.tradeDate,
        });

        if (!reviewTargetId) {
            throw new Error(
                `[review-point.service] review_target not found: stockCode=${input.stockCode}, tradeDate=${input.tradeDate}`,
            );
        }

        return upsertReviewPointByTargetId(tx, {
            reviewTargetId,
            tradeTime: input.tradeTime,
            payload: input.payload,
        });
    });
}
