/**
 * data-core raw row → 차트용 DTO 매퍼.
 * 외부 의존성 없음(순수 함수). 단위 변환·필드 매핑만 담당.
 * See: actions/chartPreview.ts (호출부), lib/serialization.ts (변환 헬퍼)
 */

import type { DailyCandleRow, MinuteCandleRow, MinuteFeatureRow } from "@trade-data-manager/data-core";
import type { ChartCandle, ChartOverlayPoint } from "@/types/chart";
import { toNum, dateToUnix } from "@/lib/serialization";

export function toDailyChartCandle(r: DailyCandleRow): ChartCandle {
    return {
        time: dateToUnix(r.tradeDate),
        open: toNum(r.openKrx),
        high: toNum(r.highKrx),
        low: toNum(r.lowKrx),
        close: toNum(r.closeKrx),
        volume: toNum(r.tradingVolumeKrx),
        amount: toNum(r.tradingAmountKrx),
        prevCloseKrx: r.prevCloseKrx != null ? Number(r.prevCloseKrx) : undefined,
        prevCloseNxt: r.prevCloseNxt != null ? Number(r.prevCloseNxt) : undefined,
    };
}

export function buildMinuteCandles(rows: MinuteCandleRow[]): ChartCandle[] {
    const out: ChartCandle[] = [];
    for (const r of rows) {
        if (
            r.openRateNxt === null ||
            r.highRateNxt === null ||
            r.lowRateNxt === null ||
            r.closeRateNxt === null
        ) continue;

        out.push({
            time: r.unixTimestamp,
            open: toNum(r.openRateNxt),
            high: toNum(r.highRateNxt),
            low: toNum(r.lowRateNxt),
            close: toNum(r.closeRateNxt),
            volume: toNum(r.tradingVolume),
            amount: toNum(r.tradingAmount),
            accAmount: toNum(r.accumulatedTradingAmount),
        });
    }
    return out;
}

/**
 * 분봉 raw + 분봉 피처 raw를 합쳐 ChartOverlayPoint[]로 변환.
 * - close_rate_nxt가 null인 봉은 제외
 * - features의 cumulative_trading_amount를 시간(unix) 기준으로 매칭
 */
export function buildOverlayPoints(
    minute: MinuteCandleRow[],
    features: MinuteFeatureRow[],
): ChartOverlayPoint[] {
    const cumByTime = new Map<string, unknown>();
    for (const f of features) {
        const t = f.tradeTime ?? f.trade_time;
        if (t === undefined || t === null) continue;
        const key = String(t).slice(0, 8);
        cumByTime.set(key, f.cumulativeTradingAmount ?? f.cumulative_trading_amount);
    }

    const out: ChartOverlayPoint[] = [];
    for (const r of minute) {
        if (r.closeRateNxt === null) continue;
        const v = toNum(r.closeRateNxt);
        if (!Number.isFinite(v)) continue;
        const key = String(r.tradeTime).slice(0, 8);
        out.push({
            time: r.unixTimestamp,
            value: v,
            amount: toNum(r.tradingAmount),
            cumAmount: toNum(cumByTime.get(key)),
        });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}
