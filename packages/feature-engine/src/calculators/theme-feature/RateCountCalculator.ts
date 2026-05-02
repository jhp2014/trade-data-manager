import { integer } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * closeRateNxt가 특정 등락률(%) 이상인 종목 수.
 *
 *   new RateCountCalculator(5)  → cnt5RateStockNum
 */
export class RateCountCalculator implements ThemeFeatureCalculator {
    constructor(private readonly threshold: number) { }

    private get tsName() { return `cnt${this.threshold}RateStockNum`; }
    private get dbName() { return `cnt_${this.threshold}_rate_stock_num`; }

    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey(this.tsName, prefix)]: integer(dbKey(this.dbName, prefix))
                .notNull()
                .default(0),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        let count = 0;
        for (const f of ctx.stockFeatures) {
            if (Number(f.closeRateNxt ?? 0) >= this.threshold) count++;
        }
        return { [this.tsName]: count };
    }
}
