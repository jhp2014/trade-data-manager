import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import type { Database } from "../db";

/**
 * 주어진 타깃들의 모든 Point 를 reviewTargetId → rows(tradeTime ASC) 맵으로 적재한다.
 * - load/export/bundle 쿼리가 "타깃 묶음 → 그 포인트들" 단계에서 공통으로 쓴다.
 * - 반환은 raw row 라 각 호출부가 필요한 형태(중첩/평탄/번들)로 투영한다.
 */
export async function findPointsByTargetIds(
    db: Database,
    targetIds: bigint[],
): Promise<Map<bigint, Array<typeof reviewPoints.$inferSelect>>> {
    const map = new Map<bigint, Array<typeof reviewPoints.$inferSelect>>();
    if (targetIds.length === 0) return map;

    const points = await db
        .select()
        .from(reviewPoints)
        .where(inArray(reviewPoints.reviewTargetId, targetIds))
        .orderBy(asc(reviewPoints.reviewTargetId), asc(reviewPoints.tradeTime));

    for (const point of points) {
        const arr = map.get(point.reviewTargetId) ?? [];
        arr.push(point);
        map.set(point.reviewTargetId, arr);
    }
    return map;
}

export type ReviewPointSeed = {
    tradeTime: string;
    payloadJson: Record<string, string | string[]>;
};

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
    const [target] = await db
        .select({ id: reviewTargets.id })
        .from(reviewTargets)
        .where(
            and(
                eq(reviewTargets.stockCode, input.stockCode),
                eq(reviewTargets.tradeDate, input.tradeDate),
            ),
        )
        .limit(1);

    if (!target) {
        throw new Error(
            `[review-point.repository] review_target not found: stockCode=${input.stockCode}, tradeDate=${input.tradeDate}`,
        );
    }

    const [row] = await db
        .insert(reviewPoints)
        .values({
            reviewTargetId: target.id,
            tradeTime: input.tradeTime,
            payloadJson: input.payload,
        })
        .onConflictDoUpdate({
            target: [reviewPoints.reviewTargetId, reviewPoints.tradeTime],
            set: {
                payloadJson: sql`EXCLUDED.payload_json`,
                updatedAt: sql`NOW()`,
            },
        })
        .returning({ id: reviewPoints.id });

    return { id: row.id.toString() };
}

/** Point 1건 삭제(id 기준). */
export async function deleteReviewPointById(db: Database, id: bigint): Promise<void> {
    await db.delete(reviewPoints).where(eq(reviewPoints.id, id));
}
