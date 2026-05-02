import { integer } from "drizzle-orm/pg-core";
import type { ThemeContextCalculator, ColumnOptions, ThemeContextInput } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class RankByCumulativeTradingAmountCalculator implements ThemeContextCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("rankByCumulativeTradingAmount", prefix)]:
                integer(dbKey("rank_by_cumulative_trading_amount", prefix))
                    .notNull(),
        };
    }

    calculate(ctx: ThemeContextInput) {
        const sorted = [...ctx.peers].sort(
            (a, b) =>
                Number(b.cumulativeTradingAmount ?? 0) -
                Number(a.cumulativeTradingAmount ?? 0)
        );
        const rank = sorted.findIndex((p) => p.id === ctx.target.id) + 1;
        return { rankByCumulativeTradingAmount: rank };
    }
}
