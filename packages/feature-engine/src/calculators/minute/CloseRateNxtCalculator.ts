import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class CloseRateNxtCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const col = numeric(dbKey("close_rate_nxt", prefix), { precision: 8, scale: 4 });
        return {
            [tsKey("closeRateNxt", prefix)]: nullable || prefix ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { closeRateNxt: ctx.current.closeRateNxt ?? "0" };
    }
}
