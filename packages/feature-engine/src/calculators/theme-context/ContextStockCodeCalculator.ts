import { varchar } from "drizzle-orm/pg-core";
import type { ThemeContextCalculator, ColumnOptions, ThemeContextInput } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class ContextStockCodeCalculator implements ThemeContextCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = varchar(dbKey("stock_code", prefix), { length: 10 });
        return {
            [tsKey("stockCode", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeContextInput) {
        return { stockCode: ctx.target.stockCode };
    }
}
