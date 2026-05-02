import { numeric } from "drizzle-orm/pg-core";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * 테마 종목들의 pullbackFromDayHigh 평균.
 * 음수에 가까울수록 평균 종목들이 고점에서 멀리 떨어진 상태.
 */
export class AvgPullbackCalculator implements ThemeFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = numeric(dbKey("avg_pullback", prefix), { precision: 8, scale: 4 });
        return {
            [tsKey("avgPullback", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        const features = ctx.stockFeatures;
        if (features.length === 0) return { avgPullback: "0" };
        const sum = features.reduce(
            (acc, f) => acc + Number(f.pullbackFromDayHigh ?? 0),
            0
        );
        return { avgPullback: (sum / features.length).toFixed(4) };
    }
}
