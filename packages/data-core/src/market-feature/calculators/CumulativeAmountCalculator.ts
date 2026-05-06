import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../types";

/**
 * [CumulativeAmountCalculator]
 * 분봉 단위 거래대금을 누적해 cumulative_trading_amount를 갱신.
 * ⚠️ stateful.
 */
export class CumulativeAmountCalculator implements MinuteFeatureCalculator {
    private cumulative = 0n;

    reset() {
        this.cumulative = 0n;
    }

    columns(opts: ColumnOptions = {}) {
        const { nullable } = opts;
        const col = numeric("cumulative_trading_amount", {
            precision: 18, scale: 1,
        });
        return {
            cumulativeTradingAmount: nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        const cur = BigInt(ctx.current.tradingAmount ?? "0");
        this.cumulative += cur;
        return {
            cumulativeTradingAmount: this.cumulative.toString(),
        };
    }
}
