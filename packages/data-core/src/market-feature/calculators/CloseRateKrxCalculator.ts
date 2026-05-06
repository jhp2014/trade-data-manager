import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../types";

export class CloseRateKrxCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { nullable } = opts;
        const col = numeric("close_rate_krx", { precision: 8, scale: 4 });
        return {
            closeRateKrx: nullable ? col : col.notNull(),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        return { closeRateKrx: ctx.current.closeRateKrx ?? "0" };
    }
}
