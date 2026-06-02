import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { reviewManualKeys, reviewPoints, reviewTargets } from "../schema/review";
import type { ReviewManualKey } from "../schema/review";
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
            `[review.repository] review_target not found: stockCode=${input.stockCode}, tradeDate=${input.tradeDate}`,
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

export type ReviewLoadKey = { stockCode: string; tradeDate: string };

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
                    exportFeatureKey(target.stockCode, target.tradeDate, point.tradeTime),
                ) ?? {},
        })),
    }));
}

async function loadTargets(
    db: Database,
    opts: { keys?: ReviewLoadKey[]; limit?: number },
): Promise<Array<typeof reviewTargets.$inferSelect>> {
    const keys = opts.keys;
    if (keys && keys.length === 0) return [];

    if (keys && keys.length > 0) {
        // 정확한 (code, date) 쌍 매칭: code/date IN 으로 좁힌 뒤 JS 에서 쌍 필터.
        const codes = Array.from(new Set(keys.map((k) => k.stockCode)));
        const dates = Array.from(new Set(keys.map((k) => k.tradeDate)));
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

        const wanted = new Set(keys.map((k) => `${k.stockCode}|${k.tradeDate}`));
        return rows.filter((row) => wanted.has(`${row.stockCode}|${row.tradeDate}`));
    }

    const query = db
        .select()
        .from(reviewTargets)
        .orderBy(desc(reviewTargets.tradeDate), asc(reviewTargets.stockCode));

    return opts.limit ? query.limit(opts.limit) : query;
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
    if (!key) throw new Error("[review.repository] manual key is empty");

    const [{ maxOrder }] = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${reviewManualKeys.sortOrder}), -1)` })
        .from(reviewManualKeys);

    await db
        .insert(reviewManualKeys)
        .values({ key, label: input.label?.trim() || null, sortOrder: Number(maxOrder) + 1 })
        .onConflictDoNothing({ target: reviewManualKeys.key });
}

/**
 * 수동 입력 키 삭제(비파괴적).
 * 레지스트리 행만 제거하며 각 review_point 의 payload 값은 보존한다.
 * 동일 키를 다시 추가하면 payload 에 남아있던 값이 그대로 복구된다.
 */
export async function deleteManualKey(db: Database, key: string): Promise<void> {
    await db.delete(reviewManualKeys).where(eq(reviewManualKeys.key, key.trim()));
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
