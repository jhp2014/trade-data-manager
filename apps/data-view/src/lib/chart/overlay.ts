/**
 * 테마 번들 → 오버레이 시리즈 변환 헬퍼.
 *  - self 는 항상 포함
 *  - peers 는 최종값 기준 내림차순 정렬
 *  - CHART_OVERLAY_MAX_SERIES 로 컷
 * See: lib/chart/mappers.ts (buildOverlayPoints), lib/chartPadding.ts
 */

import type { ThemeBundle, ThemeBundleMember } from "@trade-data-manager/data-core";
import type { ChartOverlaySeries } from "@/types/chart";
import { fillMissingOverlayPoints } from "@/lib/chartPadding";
import { buildOverlayPoints } from "./mappers";
import { CHART_OVERLAY_MAX_SERIES } from "@/lib/constants";

export const SELF_COLOR = "#000000";

export const PALETTE = [
    "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
    "#fb7185", "#22d3ee", "#fde047", "#c084fc", "#4ade80",
];

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
        result.push({
            stockCode: selfStockCode,
            stockName: selfEntry.member.stockName,
            isSelf: true,
            series: selfEntry.points,
        });
    }

    const peers: ChartOverlaySeries[] = [];
    for (const [code, { member, points }] of seriesByMember.entries()) {
        if (code === selfStockCode) continue;
        peers.push({
            stockCode: code,
            stockName: member.stockName,
            isSelf: false,
            series: points,
        });
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
        map.set(s.stockCode, s.isSelf ? SELF_COLOR : PALETTE[idx % PALETTE.length]);
    });
    return map;
}
