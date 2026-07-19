// ChartReadModel — /chart 응답(ChartBundle) 조립을 app 이 소유한다(CQRS 읽기측).
// core 는 얇은 조회 3개(수정주가 일봉·원주가 일봉·분봉)만 노출하고, 화면용 복합은 여기서 만든다:
//  · daily   : 수정주가 일봉 [date−2년, date] (일봉 pane 연속성)
//  · minutes : 당일 분봉 → densifyMinutes(VI/무거래 flat-fill, 도메인 단일 채움정책)
//  · basePrice : 분봉 % 기준가(basePricesOf) = 직전 거래일 원주가 종가 + 감자·액분 조정계수 보정(당일 원주가 스케일).
//               분봉이 원주가라 base 도 원주가 스케일이어야 맞고, 이벤트가 낀 날은 보정 없인 %가 배율만큼 폭주한다.
import {
    chartDailyRange,
    subtractMonths,
    densifyMinutes,
    basePricesOf,
    RAW_DAILY_LOOKBACK_MONTHS,
    type AdjustedDailyReader,
    type MinuteReader,
    type RawDailyReader,
} from "@trade-data-manager/market";
import type { ChartBundle } from "@trade-data-manager/wire";

// /chart 응답(ChartBundle)은 apps/api·apps/workbench 공유 계약(contracts/wire). 여기선 그 계약대로 조립만 한다.
export type { ChartBundle };

export interface ChartReadModelDeps {
    dailyCandle: AdjustedDailyReader;
    minuteCandle: MinuteReader;
    rawDailyCandle: RawDailyReader;
}

export class ChartReadModel {
    constructor(private readonly deps: ChartReadModelDeps) {}

    async chartByCode(stockCode: string, date: string): Promise<ChartBundle> {
        const { dailyCandle, minuteCandle, rawDailyCandle } = this.deps;
        // 원주가는 replay 와 동일 윈도로 조회 후 date 직전 마지막 캔들을 base 로 뽑는다(휴장·거래정지 갭 흡수).
        const rawRange = { from: subtractMonths(date, RAW_DAILY_LOOKBACK_MONTHS), to: date };
        const [daily, rawMinutes, rawDaily] = await Promise.all([
            dailyCandle.getDailyCandles(stockCode, chartDailyRange(date)),
            minuteCandle.getMinuteCandles(stockCode, date),
            rawDailyCandle.getRawDailyCandles(stockCode, rawRange),
        ]);
        const { base } = basePricesOf(rawDaily, daily, date);
        return {
            stockCode,
            daily,
            minutes: densifyMinutes(rawMinutes),
            basePrice: base.krx === null && base.un === null ? null : base,
        };
    }
}
