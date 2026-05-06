import { varchar } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../types";

export class StockCodeCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { nullable } = opts;
        const col = varchar("stock_code", { length: 10 });
        return {
            stockCode: nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { stockCode: ctx.current.stockCode };
    }
}
