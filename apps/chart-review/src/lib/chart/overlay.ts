/**
 * 테마 번들 → 오버레이 시리즈 변환 헬퍼.
 *  - self 는 항상 포함
 *  - peers 는 최종값 기준 내림차순 정렬
 *  - CHART_OVERLAY_MAX_SERIES 로 컷
 * See: lib/chart/mappers.ts (buildOverlayPoints), lib/chartPadding.ts
 */

import type { ThemeBundle, ThemeBundleMember } from "@trade-data-manager/data-core";
import { fillMissingMinuteCandles } from "@trade-data-manager/chart-utils";
import type { ChartOverlaySeries } from "@/types/chart";
import { fillMissingOverlayPoints } from "@/lib/chartPadding";
import { buildOverlayPoints, toDailyChartCandle, buildMinuteCandles } from "./mappers";
import { CHART_OVERLAY_MAX_SERIES } from "@/lib/constants";
import { OVERLAY_SELF_COLOR, OVERLAY_PEER_PALETTE } from "@/lib/colors";

/**
 * 테마 번들 멤버 1개 → 오버레이 시리즈(+탐색용 풀데이터).
 * 번들이 이미 멤버별 raw 차트/리뷰를 들고 있으므로 추가 요청 없이 그대로 싣는다.
 */
function toOverlaySeries(
    member: ThemeBundleMember,
    series: ReturnType<typeof fillMissingOverlayPoints>,
    isSelf: boolean,
): ChartOverlaySeries {
    return {
        stockCode: member.stockCode,
        stockName: member.stockName,
        isSelf,
        series,
        daily: member.daily.map(toDailyChartCandle),
        minute: fillMissingMinuteCandles(buildMinuteCandles(member.minute)),
        lineTargets: member.review?.lineTargets ?? [],
        reviewPoints: (member.review?.points ?? []).map((p) => ({
            reviewId: p.reviewId,
            tradeTime: p.tradeTime,
            payload: p.payload,
        })),
        isReviewTarget: member.review != null,
        hasReview: (member.review?.points.length ?? 0) > 0,
    };
}

/**
 * 단일 테마 번들 → 오버레이 시리즈 배열.
 * self 우선, peers 최종 등락률 내림차순, MAX_SERIES 컷.
 */
export function buildThemeOverlayForBundle(
    bundle: ThemeBundle,
    selfStockCode: string,
): ChartOverlaySeries[] {
    const seriesByMember = new Map<string, { member: ThemeBundleMember; points: ReturnType<typeof fillMissingOverlayPoints> }>();

    for (const m of bundle.members) {
        const points = buildOverlayPoints(m.minute, m.features);
        if (points.length === 0) continue;
        seriesByMember.set(m.stockCode, { member: m, points: fillMissingOverlayPoints(points) });
    }

    const result: ChartOverlaySeries[] = [];

    const selfEntry = seriesByMember.get(selfStockCode);
    if (selfEntry) {
        result.push(toOverlaySeries(selfEntry.member, selfEntry.points, true));
    }

    const peers: ChartOverlaySeries[] = [];
    for (const [code, { member, points }] of seriesByMember.entries()) {
        if (code === selfStockCode) continue;
        peers.push(toOverlaySeries(member, points, false));
    }
    peers.sort((a, b) => {
        const av = a.series[a.series.length - 1]?.valueNxt ?? 0;
        const bv = b.series[b.series.length - 1]?.valueNxt ?? 0;
        return bv - av;
    });

    const remain = Math.max(0, CHART_OVERLAY_MAX_SERIES - result.length);
    return [...result, ...peers.slice(0, remain)];
}

/** 시리즈 배열에 색상을 할당. 첫(자기 종목)에는 검정색. */
export function assignSeriesColors(series: ChartOverlaySeries[]): Map<string, string> {
    const map = new Map<string, string>();
    series.forEach((s, idx) => {
        map.set(s.stockCode, s.isSelf ? OVERLAY_SELF_COLOR : OVERLAY_PEER_PALETTE[idx % OVERLAY_PEER_PALETTE.length]);
    });
    return map;
}
