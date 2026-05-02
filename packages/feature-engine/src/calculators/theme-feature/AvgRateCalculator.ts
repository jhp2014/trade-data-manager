import { numeric } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * 테마 종목들의 closeRateNxt 평균.
 */
export class AvgRateCalculator implements ThemeFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = numeric(dbKey("avg_rate", prefix), { precision: 8, scale: 4 });
        return {
            [tsKey("avgRate", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        const features = ctx.stockFeatures;
        if (features.length === 0) return { avgRate: "0" };
        const sum = features.reduce(
            (acc, f) => acc + Number(f.closeRateNxt ?? 0),
            0
        );
        return { avgRate: (sum / features.length).toFixed(4) };
    }
}
