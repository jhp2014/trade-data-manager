"use server";

import { getThemeBundle } from "@trade-data-manager/data-core";
import type { ThemeBundle, ThemeBundleMember } from "@trade-data-manager/data-core";
import { getDataViewDb } from "./db";
import { fillMissingMinuteCandles } from "@/lib/chartPadding";
import { dateToUnix } from "@/lib/serialization";
import { type Result, okResult, errResult } from "@/lib/result";
import { toDailyChartCandle, buildMinuteCandles } from "@/lib/chart/mappers";
import { buildThemeOverlayForBundle } from "@/lib/chart/overlay";
import type { ChartPreviewDTO, ChartThemeOverlay } from "@/types/chart";

export type {
    DailyCandle,
    MinuteCandle,
    ChartOverlayPoint,
    ChartLinePoint,
    ChartOverlaySeries,
    ChartThemeOverlay,
    ChartPreviewDTO,
} from "@/types/chart";

/**
 * (stockCode, tradeDate) 1회 조회로 모든 테마 번들을 가져와
 * 테마별 오버레이 시리즈를 묶어 응답.
 *
 * tradeTime 은 server 가 알 필요 없음 (마커 위치는 클라이언트 책임).
 */
export async function fetchChartPreviewAction(params: {
    stockCode: string;
    tradeDate: string;
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

        // 진입일 prevClose (분봉 가격 라인 % 변환 기준)
        const entryTime = dateToUnix(params.tradeDate);
        const entryCandle = daily.find((c) => c.time === entryTime) ?? null;
        const prevCloseKrx = entryCandle?.prevCloseKrx ?? null;
        const prevCloseNxt = entryCandle?.prevCloseNxt ?? null;

        const themes: ChartThemeOverlay[] = bundles.map((b) => ({
            themeId: b.themeId,
            themeName: b.themeName,
            overlaySeries: buildThemeOverlayForBundle(b, params.stockCode),
        }));

        return okResult({
            data: {
                daily,
                minute,
                selfStockCode: params.stockCode,
                selfStockName: self?.stockName ?? params.stockCode,
                prevCloseKrx,
                prevCloseNxt,
                themes,
            },
        });
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
