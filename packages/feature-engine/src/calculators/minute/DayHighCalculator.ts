import { numeric, time } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * [DayHighCalculator]
 * 당일 고점 그 자체: 최고 등락률(NXT)과 그 시각.
 *
 *  - dayHighRate
 *  - dayHighTime
 *
 * ⚠️ stateful.
 */
export class DayHighCalculator implements MinuteFeatureCalculator {
    private dayHighRate = 0;
    private dayHighTime = "";

    reset() {
        this.dayHighRate = 0;
        this.dayHighTime = "";
    }

    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("dayHighRate", prefix)]: numeric(dbKey("day_high_rate", prefix), {
                precision: 8, scale: 4,
            }),
            [tsKey("dayHighTime", prefix)]: time(dbKey("day_high_time", prefix)),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        const cur = ctx.current;
        const curHigh = Number(cur.highRateNxt);

        if (curHigh > this.dayHighRate) {
            this.dayHighRate = curHigh;
            this.dayHighTime = cur.tradeTime;
        }

        return {
            dayHighRate: this.dayHighRate.toFixed(4),
            dayHighTime: this.dayHighTime || null,
        };
    }
}
