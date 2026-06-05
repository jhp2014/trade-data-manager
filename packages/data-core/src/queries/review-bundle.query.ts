import { and, asc, eq, inArray } from "drizzle-orm";
import { reviewPoints, reviewTargets } from "../schema/review";
import type { Database } from "../db";

// ── 탐색용 review 합류 (theme-bundle 멤버에 매달기) ──────────────────

export type ReviewBundlePoint = {
    reviewId: string;
    tradeTime: string;
    payload: Record<string, string | string[]>;
};

/** review_target 1건 + 그 Point List(수동값 포함). 차트 번들 멤버에 매단다. */
export type ReviewTargetBundle = {
    reviewTargetId: string;
    lineTargets: number[];
    points: ReviewBundlePoint[];
};

/**
 * 단일 거래일에서 주어진 종목코드들 중 review_target 인 것들의 Point List 를
 * stockCode → ReviewTargetBundle 맵으로 반환한다.
 * - getThemeBundle 이 멤버마다 "이 종목이 Point List 를 가졌나 + 무엇인가"를
 *   응답에 실어 보내기 위한 헬퍼. tradeDate 가 고정이라 쿼리 2회(타깃 IN, 포인트 IN)면 충분.
 * - feature 는 멤버가 이미 하루치 시계열(findFeaturesByCodesAndDate)을 들고 오므로 중복 적재하지 않는다.
 */
export async function findReviewTargetsWithPointsByCodes(
    db: Database,
    params: { stockCodes: string[]; tradeDate: string },
): Promise<Map<string, ReviewTargetBundle>> {
    const { stockCodes, tradeDate } = params;
    if (stockCodes.length === 0) return new Map();

    const targets = await db
        .select()
        .from(reviewTargets)
        .where(
            and(
                inArray(reviewTargets.stockCode, stockCodes),
                eq(reviewTargets.tradeDate, tradeDate),
            ),
        );
    if (targets.length === 0) return new Map();

    const targetIds = targets.map((target) => target.id);
    const points = await db
        .select()
        .from(reviewPoints)
        .where(inArray(reviewPoints.reviewTargetId, targetIds))
        .orderBy(asc(reviewPoints.reviewTargetId), asc(reviewPoints.tradeTime));

    const pointsByTargetId = new Map<bigint, ReviewBundlePoint[]>();
    for (const point of points) {
        const arr = pointsByTargetId.get(point.reviewTargetId) ?? [];
        arr.push({
            reviewId: point.id.toString(),
            tradeTime: point.tradeTime,
            payload: point.payloadJson,
        });
        pointsByTargetId.set(point.reviewTargetId, arr);
    }

    const out = new Map<string, ReviewTargetBundle>();
    for (const target of targets) {
        out.set(target.stockCode, {
            reviewTargetId: target.id.toString(),
            lineTargets: target.lineTargets,
            points: pointsByTargetId.get(target.id) ?? [],
        });
    }
    return out;
}
