import { integer } from "drizzle-orm/pg-core";
import type { ThemeContextCalculator, ColumnOptions, ThemeContextInput } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * peers 중 closeRateKrx 내림차순 정렬에서 target의 순위 (1-based).
 * 동률은 첫 번째 발견 순서로 부여 (안정 정렬).
 */
export class RankByRateKrxCalculator implements ThemeContextCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("rankByRateKrx", prefix)]: integer(dbKey("rank_by_rate_krx", prefix))
                .notNull(),
        };
    }

    calculate(ctx: ThemeContextInput) {
        const sorted = [...ctx.peers].sort(
            (a, b) => Number(b.closeRateKrx ?? 0) - Number(a.closeRateKrx ?? 0)
        );
        const rank = sorted.findIndex((p) => p.id === ctx.target.id) + 1;
        return { rankByRateKrx: rank };
    }
}
