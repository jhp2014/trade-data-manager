import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * [CumulativeAmountCalculator]
 * 분봉 단위 거래대금을 누적해 cumulative_trading_amount를 갱신.
 * ⚠️ stateful.
 */
export class CumulativeAmountCalculator implements MinuteFeatureCalculator {
    private cumulative = 0n;  // bigint로 누적 (overflow 방지)

    reset() {
        this.cumulative = 0n;
    }

    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const isSlot = !!prefix;
        const col = numeric(dbKey("cumulative_trading_amount", prefix), {
            precision: 18, scale: 1,
        });
        return {
            [tsKey("cumulativeTradingAmount", prefix)]:
                isSlot || nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        // tradingAmount는 numeric이라 string으로 들어옴 → BigInt로 안전 누적
        const cur = BigInt(ctx.current.tradingAmount ?? "0");
        this.cumulative += cur;
        return {
            cumulativeTradingAmount: this.cumulative.toString(),
        };
    }
}
