import type { ThemeSnapshotMember } from "@trade-data-manager/data-core";
import type { StockMetricsDTO } from "@/types/deck";

/**
 * ThemeSnapshotMember (data-core raw row) → 클라이언트 직렬화 안전 DTO 변환.
 *
 *  - bigint 필드는 string 으로 직렬화
 *  - 거래대금 구간별 카운트(cnt_{a}_amt) 는 amountDistribution 객체로 조립
 *  - feature 가 null 이면 stockCode/stockName 만 채우고 나머지는 null
 */
export function toStockMetricsDTO(
    member: ThemeSnapshotMember,
    statAmounts: readonly number[],
): StockMetricsDTO {
    const f = member.feature;

    const distribution: Record<number, number> | null = f
        ? (() => {
            const d: Record<number, number> = {};
            for (const a of statAmounts) {
                d[a] = toInt(f[`cnt_${a}_amt`]) ?? toInt(f[`cnt${a}Amt`]) ?? 0;
            }
            return d;
        })()
        : null;

    return {
        stockCode: member.stockCode,
        stockName: member.stockName,
        closeRate: f ? toNum(f.close_rate_nxt ?? f.closeRateNxt) : null,
        cumulativeAmount: f
            ? bigIntOrNullToString(toBigInt(f.cumulative_trading_amount ?? f.cumulativeTradingAmount))
            : null,
        dayHighRate: f ? toNum(f.day_high_rate ?? f.dayHighRate) : null,
        pullbackFromHigh: f ? toNum(f.pullback_from_day_high ?? f.pullbackFromDayHigh) : null,
        minutesSinceDayHigh: f ? toInt(f.minutes_since_day_high ?? f.minutesSinceDayHigh) : null,
        currentMinuteAmount: bigIntOrNullToString(member.currentMinuteAmount),
        amountDistribution: distribution,
    };
}

function bigIntOrNullToString(v: bigint | null): string | null {
    return v === null ? null : v.toString();
}

function toNum(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
    const n = toNum(v);
    return n === null ? null : Math.trunc(n);
}

function toBigInt(v: unknown): bigint | null {
    if (v === null || v === undefined || v === "") return null;
    try {
        if (typeof v === "bigint") return v;
        if (typeof v === "number") return BigInt(Math.trunc(v));
        const s = String(v).split(".")[0];
        return BigInt(s);
    } catch {
        return null;
    }
}
