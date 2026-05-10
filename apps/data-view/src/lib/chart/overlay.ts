/**
 * 테마 오버레이 시리즈 조립 도메인 규칙.
 *  - self를 첫 번째에 배치
 *  - peers는 마지막 시점 등락률 내림차순 정렬
 *  - CHART_OVERLAY_MAX_SERIES로 자름
 * See: lib/chart/mappers.ts (buildOverlayPoints), lib/chartPadding.ts
 */

import type { ThemeBundle, ThemeBundleMember } from "@trade-data-manager/data-core";
import type { ChartOverlaySeries } from "@/types/chart";
// peers 정렬 기준: 마지막 시점 valueNxt 고정 (모드 전환 시 색상 매핑 불변)
import { fillMissingOverlayPoints } from "@/lib/chartPadding";
import { buildOverlayPoints } from "./mappers";
import { CHART_OVERLAY_MAX_SERIES } from "@/lib/constants";

export const SELF_COLOR = "#000000";

export const PALETTE = [
    "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
    "#fb7185", "#22d3ee", "#fde047", "#c084fc", "#4ade80",
];

export function buildThemeOverlay(
    bundles: ThemeBundle[],
    selfStockCode: string,
): ChartOverlaySeries[] {
    const memberMap = new Map<string, ThemeBundleMember>();
    for (const b of bundles) {
        for (const m of b.members) {
            if (!memberMap.has(m.stockCode)) memberMap.set(m.stockCode, m);
        }
    }

    const seriesByCode = new Map<string, ReturnType<typeof fillMissingOverlayPoints>>();
    for (const [code, m] of memberMap.entries()) {
        const points = buildOverlayPoints(m.minute, m.features);
        if (points.length === 0) continue;
        seriesByCode.set(code, fillMissingOverlayPoints(points));
    }

    const result: ChartOverlaySeries[] = [];

    const selfPoints = seriesByCode.get(selfStockCode);
    if (selfPoints && selfPoints.length > 0) {
        const selfMember = memberMap.get(selfStockCode)!;
        result.push({
            stockCode: selfStockCode,
            stockName: selfMember.stockName,
            isSelf: true,
            series: selfPoints,
        });
    }

    const peers: ChartOverlaySeries[] = [];
    for (const [code, points] of seriesByCode.entries()) {
        if (code === selfStockCode) continue;
        const m = memberMap.get(code)!;
        peers.push({
            stockCode: code,
            stockName: m.stockName,
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

/** 종목 코드 → 색상 매핑. 두 차트(분봉/오버레이)가 동일한 색상을 공유하도록 한다. */
export function assignSeriesColors(series: ChartOverlaySeries[]): Map<string, string> {
    const map = new Map<string, string>();
    series.forEach((s, idx) => {
        map.set(s.stockCode, s.isSelf ? SELF_COLOR : PALETTE[idx % PALETTE.length]);
    });
    return map;
}
