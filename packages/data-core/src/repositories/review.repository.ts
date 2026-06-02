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
    if (!from || !to) throw new Error("[review.repository] manual key rename: empty key");
    if (from === to) return { renamedPayloads: 0 };
    if (!/^[A-Za-z0-9_]+$/.test(to)) {
        throw new Error("[review.repository] manual key 는 영문/숫자/밑줄만 사용할 수 있습니다.");
    }

    const conflict = await db
        .select({ key: reviewManualKeys.key })
        .from(reviewManualKeys)
        .where(eq(reviewManualKeys.key, to))
        .limit(1);
    if (conflict.length > 0) {
        throw new Error(`[review.repository] 이미 존재하는 키입니다: ${to}`);
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
