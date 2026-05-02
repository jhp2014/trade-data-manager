import { date } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class TradeDateCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = date(dbKey("trade_date", prefix));
        return {
            [tsKey("tradeDate", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { tradeDate: ctx.current.tradeDate };
    }
}
