import { time } from "drizzle-orm/pg-core";
import type { ThemeContextCalculator, ColumnOptions, ThemeContextInput } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class ContextTradeTimeCalculator implements ThemeContextCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = time(dbKey("trade_time", prefix));
        return {
            [tsKey("tradeTime", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeContextInput) {
        return { tradeTime: ctx.tradeTime };
    }
}
