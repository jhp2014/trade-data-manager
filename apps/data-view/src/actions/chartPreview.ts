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

/* ============================================================================
 * Stock Chart 모드용 경량 액션
 * ============================================================================
 *
 * 텍스트 입력에서 추출한 (stockCode, tradeDate) 로 테마 칩 목록을 빠르게
 * 보여주기 위한 액션. fetchChartPreviewAction 의 캔들·오버레이 가공 비용을
 * 생략하고 themeId / themeName 만 반환한다.
 *
 * 사용자가 칩을 클릭하면 ChartModal 이 열리면서 fetchChartPreviewAction 이
 * (stockCode, tradeDate) 동일 인자로 호출되지만, 두 액션 모두 내부적으로
 * getThemeBundle 을 호출하므로 DB I/O 자체는 동등 비용. (React Query 의
 * 쿼리키는 분리되어 있어 캐시 공유는 하지 않는다.)
 */

export interface ChartThemeMeta {
    themeId: string;
    themeName: string;
}

export interface StockThemesDTO {
    themes: ChartThemeMeta[];
    /** self 종목 이름 (헤더 표시용) */
    selfStockName: string;
}

export async function fetchStockThemesAction(params: {
    stockCode: string;
    tradeDate: string;
}): Promise<Result<{ data: StockThemesDTO }>> {
    try {
        const db = getDataViewDb();
        const bundles = await getThemeBundle(db, {
            stockCode: params.stockCode,
            tradeDate: params.tradeDate,
        });

        const self = pickSelfMember(bundles);
        const themes: ChartThemeMeta[] = bundles.map((b) => ({
            themeId: b.themeId,
            themeName: b.themeName,
        }));

        return okResult({
            data: {
                themes,
                selfStockName: self?.stockName ?? params.stockCode,
            },
        });
    } catch (err) {
        return errResult(err);
    }
}
