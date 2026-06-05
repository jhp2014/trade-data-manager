import { and, eq, inArray, sql } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import type { Database } from "../db";

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

// ── Sheet → DB 대량 병합 Import ──────────────────────────────────────

/**
 * 병합 대상 1건. reviewId 가 있으면 그것으로 식별(우선),
 * 없으면 (stockCode, tradeDate, tradeTime) 좌표로 식별한다.
 * values 는 "비어있지 않은" m_ 값만 담는다(키는 payloadJson 키 = m_ 접두 제거).
 */
export type PayloadMergeItem = {
    reviewId?: string;
    stockCode?: string;
    tradeDate?: string;
    tradeTime?: string;
    values: Record<string, string | string[]>;
    /** 리포트용 식별 문자열(예: 시트 행번호). */
    ref: string;
};

export type PayloadMergeReport = {
    /** payload 가 실제 병합된 타점 수. */
    merged: number;
    /** 병합할 값이 없어 건너뛴 행 ref 목록. */
    skippedNoValues: string[];
    /** 식별 실패(타점 미발견)로 건너뛴 행 ref 목록. */
    skippedNotFound: string[];
};

/**
 * 시트에서 읽은 값을 DB payload_json 에 대량 병합한다.
 * - 비어있지 않은 키만 `payload_json || {…}` 로 덮어쓴다(빈 셀은 절대 삭제하지 않음).
 * - reviewId 우선, 없으면 좌표(code+date+time HH:MM)로 식별. 못 찾으면 스킵+리포트.
 */
export async function mergeReviewPointPayloads(
    db: Database,
    items: PayloadMergeItem[],
): Promise<PayloadMergeReport> {
    const report: PayloadMergeReport = { merged: 0, skippedNoValues: [], skippedNotFound: [] };

    // 병합할 값이 있는 항목만 추린다.
    const effective = items.filter((item) => {
        if (Object.keys(item.values).length === 0) {
            report.skippedNoValues.push(item.ref);
            return false;
        }
        return true;
    });
    if (effective.length === 0) return report;

    // 1) reviewId 로 식별 가능한 항목.
    const idItems = effective.filter((item) => item.reviewId && /^\d+$/.test(item.reviewId));
    const existingIds = new Set<string>();
    if (idItems.length > 0) {
        const ids = Array.from(new Set(idItems.map((item) => BigInt(item.reviewId as string))));
        const rows = await db
            .select({ id: reviewPoints.id })
            .from(reviewPoints)
            .where(inArray(reviewPoints.id, ids));
        for (const row of rows) existingIds.add(row.id.toString());
    }

    // 2) 좌표(code+date+time)로 식별할 항목.
    const coordItems = effective.filter(
        (item) =>
            !(item.reviewId && existingIds.has(item.reviewId)) &&
            item.stockCode &&
            item.tradeDate &&
            item.tradeTime,
    );
    const coordToId = new Map<string, string>();
    if (coordItems.length > 0) {
        const codes = Array.from(new Set(coordItems.map((i) => i.stockCode as string)));
        const dates = Array.from(new Set(coordItems.map((i) => i.tradeDate as string)));
        const rows = await db
            .select({
                id: reviewPoints.id,
                code: reviewTargets.stockCode,
                date: reviewTargets.tradeDate,
                time: reviewPoints.tradeTime,
            })
            .from(reviewPoints)
            .innerJoin(reviewTargets, eq(reviewPoints.reviewTargetId, reviewTargets.id))
            .where(and(inArray(reviewTargets.stockCode, codes), inArray(reviewTargets.tradeDate, dates)));
        for (const row of rows) {
            coordToId.set(`${row.code}|${row.date}|${row.time.slice(0, 5)}`, row.id.toString());
        }
    }

    // 3) 각 항목의 대상 id 를 확정하고 병합.
    for (const item of effective) {
        let id: string | undefined;
        if (item.reviewId && existingIds.has(item.reviewId)) {
            id = item.reviewId;
        } else if (item.stockCode && item.tradeDate && item.tradeTime) {
            id = coordToId.get(`${item.stockCode}|${item.tradeDate}|${item.tradeTime.slice(0, 5)}`);
        }

        if (!id) {
            report.skippedNotFound.push(item.ref);
            continue;
        }

        await db.execute(
            sql`UPDATE ${reviewPoints}
                SET payload_json = payload_json || ${JSON.stringify(item.values)}::jsonb,
                    updated_at = NOW()
                WHERE id = ${id}::bigint`,
        );
        report.merged += 1;
    }

    return report;
}
