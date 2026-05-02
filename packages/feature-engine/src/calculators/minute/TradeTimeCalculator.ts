import { time } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class TradeTimeCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = time(dbKey("trade_time", prefix));
        return {
            [tsKey("tradeTime", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { tradeTime: ctx.current.tradeTime };
    }
}
