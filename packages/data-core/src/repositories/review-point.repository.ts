import { asc, eq, inArray, sql } from "drizzle-orm";
import { reviewPoints } from "../schema/review";
import type { DbClient } from "../db";

/**
 * 주어진 타깃들의 모든 Point 를 reviewTargetId → rows(tradeTime ASC) 맵으로 적재한다.
 * - load/export/bundle 쿼리가 "타깃 묶음 → 그 포인트들" 단계에서 공통으로 쓴다.
 * - 반환은 raw row 라 각 호출부가 필요한 형태(중첩/평탄/번들)로 투영한다.
 */
export async function findPointsByTargetIds(
    db: DbClient,
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
    db: DbClient,
    point: { reviewTargetId: bigint } & ReviewPointSeed,
): Promise<void> {
    await db
        .insert(reviewPoints)
        .values(point)
        .onConflictDoNothing({
            target: [reviewPoints.reviewTargetId, reviewPoints.tradeTime],
        });
}

/** (reviewTargetId, tradeTime) 기준으로 Point payload 를 입력/수정한다. */
export async function upsertReviewPointByTargetId(
    db: DbClient,
    input: {
        reviewTargetId: bigint;
        tradeTime: string;
        payload: Record<string, string | string[]>;
    },
): Promise<{ id: string }> {
    const [row] = await db
        .insert(reviewPoints)
        .values({
            reviewTargetId: input.reviewTargetId,
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
export async function deleteReviewPointById(db: DbClient, id: bigint): Promise<void> {
    await db.delete(reviewPoints).where(eq(reviewPoints.id, id));
}
