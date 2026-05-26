import type { ThemeSnapshotMember } from "@trade-data-manager/data-core";
import type { StockMetricsDTO } from "@/types/deck";
import { toNumOrNull, toInt } from "@/lib/serialization";

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
    // MinuteCandleFeatures 의 calculator 컬럼들은 buildColumnsFromCalculators 의 Record<string,any>
    // spread 로 인해 $inferSelect 에 반영되지 않으므로 Record<string, unknown> 으로 cast.
    const f = member.feature as Record<string, unknown> | null;

    const distribution: Record<number, number> | null = f
        ? (() => {
            const d: Record<number, number> = {};
            for (const a of statAmounts) {
                d[a] = toInt(f[`cnt${a}Amt`]) ?? 0;
            }
            return d;
        })()
        : null;

    const distributionBucket: Record<number, number> | null = distribution
        ? (() => {
            const sorted = [...statAmounts].sort((a, b) => a - b);
            const b: Record<number, number> = {};
            for (let i = 0; i < sorted.length; i++) {
                const cur = distribution[sorted[i]] ?? 0;
                const next = i + 1 < sorted.length ? (distribution[sorted[i + 1]] ?? 0) : 0;
                b[sorted[i]] = Math.max(0, cur - next);
            }
            return b;
        })()
        : null;

    return {
        stockCode: member.stockCode,
        stockName: member.stockName,
        closeRate: f ? toNumOrNull(f.closeRateNxt) : null,
        cumulativeAmount: f ? (f.cumulativeTradingAmount as string | null) : null,
        dayHighRate: f ? toNumOrNull(f.dayHighRate) : null,
        pullbackFromHigh: f ? toNumOrNull(f.pullbackFromDayHigh) : null,
        minutesSinceDayHigh: f ? toInt(f.minutesSinceDayHigh) : null,
        amountDistribution: distribution,
        amountDistributionBucket: distributionBucket,
        isCarriedForward: f ? Boolean(f.isCarriedForward) : false,
    };
}
