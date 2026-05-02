import { date } from "drizzle-orm/pg-core";
import type { ThemeContextCalculator, ColumnOptions, ThemeContextInput } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class ContextTradeDateCalculator implements ThemeContextCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = date(dbKey("trade_date", prefix));
        return {
            [tsKey("tradeDate", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeContextInput) {
        return { tradeDate: ctx.tradeDate };
    }
}
