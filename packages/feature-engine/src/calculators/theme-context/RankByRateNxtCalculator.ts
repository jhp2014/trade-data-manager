import { integer } from "drizzle-orm/pg-core";
import type { ThemeContextCalculator, ColumnOptions, ThemeContextInput } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class RankByRateNxtCalculator implements ThemeContextCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("rankByRateNxt", prefix)]: integer(dbKey("rank_by_rate_nxt", prefix))
                .notNull(),
        };
    }

    calculate(ctx: ThemeContextInput) {
        const sorted = [...ctx.peers].sort(
            (a, b) => Number(b.closeRateNxt ?? 0) - Number(a.closeRateNxt ?? 0)
        );
        const rank = sorted.findIndex((p) => p.id === ctx.target.id) + 1;
        return { rankByRateNxt: rank };
    }
}
