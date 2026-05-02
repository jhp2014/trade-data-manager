import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class TradingAmountCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = numeric(dbKey("trading_amount", prefix), { precision: 18, scale: 1 });
        return {
            [tsKey("tradingAmount", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { tradingAmount: ctx.current.tradingAmount };
    }
}
