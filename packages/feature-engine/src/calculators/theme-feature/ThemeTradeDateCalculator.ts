import { date } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class ThemeTradeDateCalculator implements ThemeFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = date(dbKey("trade_date", prefix));
        return {
            [tsKey("tradeDate", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        return { tradeDate: ctx.tradeDate };
    }
}
