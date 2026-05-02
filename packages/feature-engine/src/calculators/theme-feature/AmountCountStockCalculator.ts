import { integer } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * 그 시각의 분봉 tradingAmount가 특정 임계값(억) 이상인 종목 수.
 *
 *   new AmountCountStockCalculator(20)  → cnt20AmtStockNum
 */
export class AmountCountStockCalculator implements ThemeFeatureCalculator {
    constructor(private readonly thresholdEok: number) { }

    private get tsName() { return `cnt${this.thresholdEok}AmtStockNum`; }
    private get dbName() { return `cnt_${this.thresholdEok}_amt_stock_num`; }

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
            const amtEok = Number(f.tradingAmount ?? 0) / 1e8;
            if (amtEok >= this.thresholdEok) count++;
        }
        return { [this.tsName]: count };
    }
}
