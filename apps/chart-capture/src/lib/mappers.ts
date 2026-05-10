import type { DailyCandle as DailyCandleSchema, MinuteCandle as MinuteCandleSchema } from "@trade-data-manager/data-core";
import type { DailyCandle, MinuteCandle } from "./chartTypes";

function toNum(v: unknown): number {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "bigint") return Number(v);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

function dateToUnix(v: unknown): number {
    if (typeof v === "string") {
        const s = v.slice(0, 10);
        if (s) {
            const t = new Date(`${s}T00:00:00+09:00`);
            return Math.floor(t.getTime() / 1000);
        }
    }
    if (v instanceof Date) return Math.floor(v.getTime() / 1000);
    return 0;
}

export function toDailyChartCandle(r: DailyCandleSchema): DailyCandle {
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

export function buildMinuteCandles(rows: MinuteCandleSchema[]): MinuteCandle[] {
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
