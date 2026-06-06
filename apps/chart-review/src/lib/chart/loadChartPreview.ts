import { getThemeBundle } from "@trade-data-manager/data-core";
import type { ThemeBundle, ThemeBundleMember } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { fillMissingMinuteCandles } from "@trade-data-manager/chart-utils";
import { dateToUnix } from "@/lib/serialization";
import { toDailyChartCandle, buildMinuteCandles } from "@/lib/chart/mappers";
import { buildThemeOverlayForBundle } from "@/lib/chart/overlay";
import type { ChartPreviewDTO, ChartThemeOverlay } from "@/types/chart";

/**
 * (stockCode, tradeDate) 1회 조회로 모든 테마 번들을 가져와 테마별 오버레이
 * 시리즈를 묶어 반환하는 순수 서버 로직.
 *
 * 과거에는 Server Action(fetchChartPreviewAction)으로 노출했으나, Server Action 은
 * 호출 시마다 Next 가 현재 라우트를 재렌더(=force-dynamic 페이지의 loadSheetRows
 * 재실행)하여 재조회 루프를 유발했다. 이제는 GET Route Handler 에서 호출한다.
 */
export async function loadChartPreview(params: {
    stockCode: string;
    tradeDate: string;
}): Promise<ChartPreviewDTO> {
    const db = getDb();
    const bundles = await getThemeBundle(db, {
        stockCode: params.stockCode,
        tradeDate: params.tradeDate,
    });

    const self = pickSelfMember(bundles);
    const daily = self ? self.daily.map(toDailyChartCandle) : [];
    const minute = self ? fillMissingMinuteCandles(buildMinuteCandles(self.minute)) : [];

    const isListingDay = self?.isListingDay ?? false;
    // 상장일은 전일종가가 없으므로 당일 첫 분봉 시가를 % 기준값으로 쓴다.
    const firstMinuteOpen =
        self && self.minute.length > 0 ? Number(self.minute[0].open) : null;
    const baseFallback = isListingDay ? firstMinuteOpen : null;

    // 진입일 분봉 가격 라인 % 변환 기준값(상장일이면 시가로 대체).
    const entryTime = dateToUnix(params.tradeDate);
    const entryCandle = daily.find((c) => c.time === entryTime) ?? null;
    const prevCloseKrx = entryCandle?.prevCloseKrx ?? baseFallback;
    const prevCloseNxt = entryCandle?.prevCloseNxt ?? baseFallback;

    const themes: ChartThemeOverlay[] = bundles.map((b) => ({
        themeId: b.themeId,
        themeName: b.themeName,
        overlaySeries: buildThemeOverlayForBundle(b, params.stockCode),
    }));

    return {
        daily,
        minute,
        prevCloseKrx,
        prevCloseNxt,
        isListingDay,
        themes,
    };
}

function pickSelfMember(bundles: ThemeBundle[]): ThemeBundleMember | null {
    for (const b of bundles) {
        const m = b.members.find((x) => x.isSelf);
        if (m) return m;
    }
    return null;
}
