import { integer } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * cumulativeTradingAmount가 특정 임계값(억) 이상인 종목 수.
 *
 *   new CumAmountCountStockCalculator(200)  → cntCum200AmtStockNum
 */
export class CumAmountCountStockCalculator implements ThemeFeatureCalculator {
    constructor(private readonly thresholdEok: number) { }

    private get tsName() { return `cntCum${this.thresholdEok}AmtStockNum`; }
    private get dbName() { return `cnt_cum_${this.thresholdEok}_amt_stock_num`; }

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
            const cumEok = Number(f.cumulativeTradingAmount ?? 0) / 1e8;
            if (cumEok >= this.thresholdEok) count++;
        }
        return { [this.tsName]: count };
    }
}
