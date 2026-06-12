import { and, eq, inArray } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import { minuteCandleFeatures } from "../schema/features";
import type { Database } from "../db";
import { FEATURE_COLUMNS } from "../market-feature/featureColumns";

// ── export / load 쿼리가 공유하는 feature 적재 헬퍼 (private) ──────────
// index.ts 에 export 하지 않는다(앱이 직접 호출하지 않음).

/** minute_candle_features 키. (stockCode, tradeDate, tradeTime) 좌표로 feature 행을 식별한다. */
export function featureKey(stockCode: string, tradeDate: string, tradeTime: string) {
    return `${stockCode}|${tradeDate}|${tradeTime.slice(0, 8)}`;
}

/**
 * 주어진 타깃/포인트 묶음이 필요로 하는 minute_candle_features 를
 * featureKey → 컬럼맵 으로 적재한다. 거래일 단위로 묶어 IN 조회한다.
 */
export async function buildFeaturesByKey(
    db: Database,
    targets: Array<typeof reviewTargets.$inferSelect>,
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
                featureKey(row.stockCode, row.tradeDate, row.tradeTime),
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
