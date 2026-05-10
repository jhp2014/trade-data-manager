/**
 * data-core raw row → 차트용 DTO 매퍼.
 * 외부 의존성 없음(순수 함수). 단위 변환·필드 매핑만 담당.
 * See: actions/chartPreview.ts (호출부), lib/serialization.ts (변환 헬퍼)
 */

import type { DailyCandleRow, MinuteCandleRow, MinuteFeatureRow } from "@trade-data-manager/data-core";
import type { DailyCandle, MinuteCandle, ChartOverlayPoint } from "@/types/chart";
import { toNum, dateToUnix } from "@/lib/serialization";

export function toDailyChartCandle(r: DailyCandleRow): DailyCandle {
    return {
        time: dateToUnix(r.tradeDate),
        krx: {
            open: toNum(r.openKrx),
            high: toNum(r.highKrx),
            low: toNum(r.lowKrx),
            close: toNum(r.closeKrx),
        },
        nxt: {
            open: toNum(r.openNxt),
            high: toNum(r.highNxt),
            low: toNum(r.lowNxt),
            close: toNum(r.closeNxt),
        },
        volumeKrx: toNum(r.tradingVolumeKrx),
        amountKrx: toNum(r.tradingAmountKrx),
        volumeNxt: toNum(r.tradingVolumeNxt),
        amountNxt: toNum(r.tradingAmountNxt),
        prevCloseKrx: r.prevCloseKrx != null ? Number(r.prevCloseKrx) : undefined,
        prevCloseNxt: r.prevCloseNxt != null ? Number(r.prevCloseNxt) : undefined,
    };
}

/**
 * 분봉 raw → MinuteCandle[].
 * 양쪽 다 null인 봉만 제외. 한쪽만 null이면 0으로 두되
 * chartPadding 단계에서 직전 값으로 보간 처리됨.
 */
export function buildMinuteCandles(rows: MinuteCandleRow[]): MinuteCandle[] {
    const out: MinuteCandle[] = [];
    for (const r of rows) {
        const krxNull =
            r.openRateKrx === null ||
            r.highRateKrx === null ||
            r.lowRateKrx === null ||
            r.closeRateKrx === null;
        const nxtNull =
            r.openRateNxt === null ||
            r.highRateNxt === null ||
            r.lowRateNxt === null ||
            r.closeRateNxt === null;

        if (krxNull && nxtNull) continue;

        out.push({
            time: r.unixTimestamp,
            krx: {
                open: krxNull ? 0 : toNum(r.openRateKrx),
                high: krxNull ? 0 : toNum(r.highRateKrx),
                low: krxNull ? 0 : toNum(r.lowRateKrx),
                close: krxNull ? 0 : toNum(r.closeRateKrx),
            },
            nxt: {
                open: nxtNull ? 0 : toNum(r.openRateNxt),
                high: nxtNull ? 0 : toNum(r.highRateNxt),
                low: nxtNull ? 0 : toNum(r.lowRateNxt),
                close: nxtNull ? 0 : toNum(r.closeRateNxt),
            },
            volume: toNum(r.tradingVolume),
            amount: toNum(r.tradingAmount),
            accAmount: toNum(r.accumulatedTradingAmount),
        });
    }
    return out;
}

/**
 * 분봉 raw + 분봉 피처 raw를 합쳐 ChartOverlayPoint[]로 변환.
 * - KRX/NXT 양쪽 다 null인 봉은 제외
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
        const hasKrx = r.closeRateKrx !== null && Number.isFinite(toNum(r.closeRateKrx));
        const hasNxt = r.closeRateNxt !== null && Number.isFinite(toNum(r.closeRateNxt));
        if (!hasKrx && !hasNxt) continue;

        const key = String(r.tradeTime).slice(0, 8);
        out.push({
            time: r.unixTimestamp,
            valueKrx: hasKrx ? toNum(r.closeRateKrx) : 0,
            valueNxt: hasNxt ? toNum(r.closeRateNxt) : 0,
            amount: toNum(r.tradingAmount),
            cumAmount: toNum(cumByTime.get(key)),
        });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}
