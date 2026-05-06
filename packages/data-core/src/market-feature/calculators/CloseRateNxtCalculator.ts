import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../types";

export class CloseRateNxtCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { nullable } = opts;
        const col = numeric("close_rate_nxt", { precision: 8, scale: 4 });
        return {
            closeRateNxt: nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { closeRateNxt: ctx.current.closeRateNxt ?? "0" };
    }
}
