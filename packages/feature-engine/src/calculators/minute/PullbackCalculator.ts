import { numeric, integer } from "drizzle-orm/pg-core";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

dayjs.extend(customParseFormat);

/**
 * [PullbackCalculator]
 * 당일 고점 기준의 상대 위치:
 *
 *  - pullbackFromDayHigh: 현재 종가율 - 고점 등락률 (음수 = 눌림)
 *  - minutesSinceDayHigh: 고점 발생 후 경과 분
 *
 * ⚠️ 의도된 계산 순서:
 *    1) 먼저 "이전 고점" 기준으로 minutesSinceDayHigh 계산 (현재 분봉 갱신 전 상태)
 *    2) 그다음 고점 갱신
 *    3) pullback은 갱신 후 고점 기준
 *
 *  → 고점이 갱신되는 순간에도 "직전 고점에서 몇 분 지나서 새 고점이 났는지"가 보존됨.
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

    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("pullbackFromDayHigh", prefix)]: numeric(
                dbKey("pullback_from_day_high", prefix),
                { precision: 8, scale: 4 }
            ),
            [tsKey("minutesSinceDayHigh", prefix)]: integer(
                dbKey("minutes_since_day_high", prefix)
            ),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        const cur = ctx.current;
        const curHigh = Number(cur.highRateNxt);

        // ① 갱신 전 상태로 minutesSinceDayHigh 계산
        //    (고점이 갱신되는 순간에도 "직전 고점으로부터의 거리"를 보존하기 위함)
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
