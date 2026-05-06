import { time } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../types";

export class TradeTimeCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { nullable } = opts;
        const col = time("trade_time");
        return {
            tradeTime: nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { tradeTime: ctx.current.tradeTime };
    }
}
