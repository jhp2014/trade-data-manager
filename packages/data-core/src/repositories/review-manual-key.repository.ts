import { asc, eq, sql } from "drizzle-orm";
import { reviewManualKeys, reviewPoints } from "../schema/review";
import type { ReviewManualKey } from "../schema/review";
import type { Database } from "../db";

// ── Manual key registry (m_ 컬럼 전역 목록) ─────────────────────────

/** sortOrder, key 순으로 정렬된 전역 수동 입력 키 목록. */
export async function listManualKeys(db: Database): Promise<ReviewManualKey[]> {
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
    db: Database,
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

/**
 * 수동 입력 키 완전 삭제(파괴적).
 * - 레지스트리 행을 제거하고,
 * - 모든 review_point.payload_json 에서 해당 키를 제거한다(`payload_json - 'key'`).
 * 삭제 후에는 필터/제안 목록에서도 자연히 사라진다(payload 데이터가 남지 않음).
 * @returns payload 에서 키가 제거된 review_point 행 수
 */
export async function deleteManualKey(db: Database, key: string): Promise<number> {
    const trimmed = key.trim();
    if (!trimmed) return 0;

    await db.delete(reviewManualKeys).where(eq(reviewManualKeys.key, trimmed));

    const result = await db.execute(
        sql`UPDATE ${reviewPoints}
            SET payload_json = payload_json - ${trimmed}, updated_at = NOW()
            WHERE payload_json ? ${trimmed}`,
    );
    return Number((result as { rowCount?: number | null }).rowCount ?? 0);
}

/**
 * 수동 입력 키 이름 변경.
 * - 레지스트리 키를 from → to 로 바꾸고,
 * - 모든 review_point.payload_json 의 from 키를 to 로 옮긴다(값 유지).
 * to 가 이미 존재하면 충돌로 에러. from === to 면 no-op.
 * @returns payload 키가 변경된 review_point 행 수
 */
export async function renameManualKey(
    db: Database,
    input: { from: string; to: string },
): Promise<{ renamedPayloads: number }> {
    const from = input.from.trim();
    const to = input.to.trim();
    if (!from || !to) throw new Error("[review-manual-key.repository] manual key rename: empty key");
    if (from === to) return { renamedPayloads: 0 };
    if (!/^[A-Za-z0-9_]+$/.test(to)) {
        throw new Error("[review-manual-key.repository] manual key 는 영문/숫자/밑줄만 사용할 수 있습니다.");
    }

    const conflict = await db
        .select({ key: reviewManualKeys.key })
        .from(reviewManualKeys)
        .where(eq(reviewManualKeys.key, to))
        .limit(1);
    if (conflict.length > 0) {
        throw new Error(`[review-manual-key.repository] 이미 존재하는 키입니다: ${to}`);
    }

    await db
        .update(reviewManualKeys)
        .set({ key: to, updatedAt: sql`NOW()` })
        .where(eq(reviewManualKeys.key, from));

    const result = await db.execute(
        sql`UPDATE ${reviewPoints}
            SET payload_json = (payload_json - ${from})
                || jsonb_build_object(${to}::text, payload_json -> ${from}),
                updated_at = NOW()
            WHERE payload_json ? ${from}`,
    );
    return { renamedPayloads: Number((result as { rowCount?: number | null }).rowCount ?? 0) };
}

/**
 * 기존 review_point.payload_json 에 존재하는 모든 키를 레지스트리에 백필(1회성).
 * 레지스트리에 없던 레거시 키를 등록해 앱에서 편집·삭제할 수 있게 한다.
 * 멱등하며(addManualKey onConflictDoNothing) payload 값은 건드리지 않는다.
 * @returns 새로 추가된 키 목록
 */
export async function backfillManualKeysFromPayloads(db: Database): Promise<string[]> {
    const result = await db.execute<{ key: string }>(
        sql`SELECT DISTINCT jsonb_object_keys(${reviewPoints.payloadJson}) AS key FROM ${reviewPoints}`,
    );
    const payloadKeys = result.rows.map((row) => row.key).filter(Boolean);

    const existing = await listManualKeys(db);
    const known = new Set(existing.map((k) => k.key));

    const added: string[] = [];
    for (const key of payloadKeys.sort()) {
        if (known.has(key)) continue;
        await addManualKey(db, { key });
        added.push(key);
    }
    return added;
}
