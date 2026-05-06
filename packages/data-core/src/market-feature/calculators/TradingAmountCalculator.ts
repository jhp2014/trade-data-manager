import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../types";

export class TradingAmountCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { nullable } = opts;
        const col = numeric("trading_amount", { precision: 18, scale: 1 });
        return {
            tradingAmount: nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { tradingAmount: ctx.current.tradingAmount };
    }
}
