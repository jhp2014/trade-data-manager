import { numeric, integer } from "drizzle-orm/pg-core";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import type { MinuteFeatureCalculator, MinuteCandleContext } from "../types";

dayjs.extend(customParseFormat);

/**
 * [PullbackCalculator]
 * 당일 고점 기준의 상대 위치:
 *
 *  - pullbackFromDayHigh: 현재 종가율 - 고점 등락률 (음수 = 눌림)
 *  - minutesSinceDayHigh: 고점 발생 후 경과 분
 *
 * ⚠️ stateful.
 */
export class PullbackCalculator implements MinuteFeatureCalculator {
    private dayHighRate = 0;
    private dayHighTime = "";

    reset() {
        this.dayHighRate = 0;
        this.dayHighTime = "";
    }

    columns() {
        return {
            pullbackFromDayHigh: numeric("pullback_from_day_high", {
                precision: 8, scale: 4,
            }),
            minutesSinceDayHigh: integer("minutes_since_day_high"),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        const cur = ctx.current;
        const curHigh = Number(cur.highRateNxt);

        // ① 갱신 전 상태로 minutesSinceDayHigh 계산
        const minutesSince = this.dayHighTime
            ? dayjs(cur.tradeTime, "HH:mm:ss").diff(
                dayjs(this.dayHighTime, "HH:mm:ss"),
                "minute"
            )
            : 0;

        // ② 고점 갱신
        if (curHigh > this.dayHighRate) {
            this.dayHighRate = curHigh;
            this.dayHighTime = cur.tradeTime;
        }

        // ③ pullback은 갱신된 고점 기준
        const pullback =
            this.dayHighRate > 0 ? Number(cur.closeRateNxt) - this.dayHighRate : 0;

        return {
            pullbackFromDayHigh: pullback.toFixed(4),
            minutesSinceDayHigh: minutesSince,
        };
    }
}
