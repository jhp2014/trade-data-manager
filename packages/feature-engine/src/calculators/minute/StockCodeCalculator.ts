import { varchar } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class StockCodeCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = varchar(dbKey("stock_code", prefix), { length: 10 });
        return {
            [tsKey("stockCode", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { stockCode: ctx.current.stockCode };
    }
}
