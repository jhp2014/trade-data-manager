import { integer } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class StockCountCalculator implements ThemeFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("cntTotalStock", prefix)]: integer(dbKey("cnt_total_stock", prefix))
                .notNull()
                .default(0),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        return { cntTotalStock: ctx.stockFeatures.length };
    }
}
