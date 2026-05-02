import { time } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class ThemeTradeTimeCalculator implements ThemeFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = time(dbKey("trade_time", prefix));
        return {
            [tsKey("tradeTime", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        return { tradeTime: ctx.tradeTime };
    }
}
