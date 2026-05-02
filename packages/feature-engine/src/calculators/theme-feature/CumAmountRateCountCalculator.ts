import { integer } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * 누적 거래대금이 임계값(억) 이상이면서 동시에 closeRateNxt가 임계값(%) 이상인 종목 수.
 *
 *   new CumAmountRateCountCalculator(200, 5)  → cntCum200AmtRate5StockNum
 *   "누적 200억 이상이고 현재 5% 이상인 종목 수"
 */
export class CumAmountRateCountCalculator implements ThemeFeatureCalculator {
    constructor(
        private readonly cumAmountEok: number,
        private readonly rateThreshold: number
    ) { }

    private get tsName() {
        return `cntCum${this.cumAmountEok}AmtRate${this.rateThreshold}StockNum`;
    }
    private get dbName() {
        return `cnt_cum_${this.cumAmountEok}_amt_rate_${this.rateThreshold}_stock_num`;
    }

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
            const rate = Number(f.closeRateNxt ?? 0);
            if (cumEok >= this.cumAmountEok && rate >= this.rateThreshold) count++;
        }
        return { [this.tsName]: count };
    }
}
