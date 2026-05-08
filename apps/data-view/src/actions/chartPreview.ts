"use server";

import { getThemeBundle } from "@trade-data-manager/data-core";
import type { ThemeBundle, ThemeBundleMember } from "@trade-data-manager/data-core";
import { getDataViewDb } from "./db";
import { fillMissingMinuteCandles } from "@/lib/chartPadding";
import { composeUnix } from "@/lib/serialization";
import { type Result, okResult, errResult } from "@/lib/result";
import { toDailyChartCandle, buildMinuteCandles } from "@/lib/chart/mappers";
import { buildThemeOverlay } from "@/lib/chart/overlay";
import type { ChartPreviewDTO } from "@/types/chart";

export type { ChartCandle, ChartOverlayPoint, ChartLinePoint, ChartOverlaySeries, ChartPreviewDTO } from "@/types/chart";

export async function fetchChartPreviewAction(params: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
}): Promise<Result<{ data: ChartPreviewDTO }>> {
    try {
        const db = getDataViewDb();
        const bundles = await getThemeBundle(db, {
            stockCode: params.stockCode,
            tradeDate: params.tradeDate,
        });

        const self = pickSelfMember(bundles);
        const daily = self ? self.daily.map(toDailyChartCandle) : [];
        const minute = self ? fillMissingMinuteCandles(buildMinuteCandles(self.minute)) : [];
        const themeOverlay = buildThemeOverlay(bundles, params.stockCode);
        const markerTime = composeUnix(params.tradeDate, params.tradeTime);
        const themes = bundles.map((b) => ({
            themeId: b.themeId,
            themeName: b.themeName,
        }));

        return okResult({ data: { daily, minute, themeOverlay, markerTime, themes } });
    } catch (err) {
        return errResult(err);
    }
}

function pickSelfMember(bundles: ThemeBundle[]): ThemeBundleMember | null {
    for (const b of bundles) {
        const m = b.members.find((x) => x.isSelf);
        if (m) return m;
    }
    return null;
}
