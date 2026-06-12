import { asc, sql } from "drizzle-orm";
import { reviewManualKeys } from "../schema/review";
import type { ReviewManualKey } from "../schema/review";
import type { DbClient } from "../db";

// ── Manual key registry (m_ 컬럼 전역 목록) ─────────────────────────

/** sortOrder, key 순으로 정렬된 전역 수동 입력 키 목록. */
export async function listManualKeys(db: DbClient): Promise<ReviewManualKey[]> {
    return db
        .select()
        .from(reviewManualKeys)
        .orderBy(asc(reviewManualKeys.sortOrder), asc(reviewManualKeys.key));
}

/**
 * 수동 입력 키 추가. 이미 있으면 무시(멱등).
 * sortOrder 는 현재 최대값 + 1 로 자동 부여한다.
 */
export async function addManualKey(
    db: DbClient,
    input: { key: string; label?: string | null },
): Promise<void> {
    const key = input.key.trim();
    if (!key) throw new Error("[review-manual-key.repository] manual key is empty");

    const [{ maxOrder }] = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${reviewManualKeys.sortOrder}), -1)` })
        .from(reviewManualKeys);

    await db
        .insert(reviewManualKeys)
        .values({ key, label: input.label?.trim() || null, sortOrder: Number(maxOrder) + 1 })
        .onConflictDoNothing({ target: reviewManualKeys.key });
}
