import { numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * [ChangeRateCalculator]
 * "현재 종가율(closeRateNxt) - N분 전 종가율"을 계산.
 *
 * 인스턴스를 minutes 값별로 따로 만들어서 등록합니다.
 *   new ChangeRateCalculator(5)   → changeRate5m
 *   new ChangeRateCalculator(10)  → changeRate10m
 */
export class ChangeRateCalculator implements MinuteFeatureCalculator {
    constructor(private readonly minutes: number) { }

    private get tsName() {
        return `changeRate${this.minutes}m`;
    }
    private get dbName() {
        return `change_rate_${this.minutes}m`;
    }

    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        // 이 컬럼은 원본 스키마에서도 nullable이므로 notNull 적용 안 함.
        return {
            [tsKey(this.tsName, prefix)]: numeric(dbKey(this.dbName, prefix), {
                precision: 8,
                scale: 4,
            }),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        const past = ctx.findCandleMinutesAgo(this.minutes);
        const key = this.tsName;

        if (!past) return { [key]: null };

        const diff =
            Number(ctx.current.closeRateNxt) - Number(past.closeRateNxt);
        return { [key]: diff.toFixed(2) };
    }
}
