// ChartReadModel — /chart 응답(ChartBundle) 조립을 app 이 소유한다(CQRS 읽기측).
// core 는 얇은 조회 3개(수정주가 일봉·원주가 일봉·분봉)만 노출하고, 화면용 복합은 여기서 만든다:
//  · daily   : 수정주가 일봉 [date−2년, date] (일봉 pane 연속성)
//  · minutes : 당일 분봉 → densifyMinutes(VI/무거래 flat-fill, 도메인 단일 채움정책)
//  · rawBase : 분봉 % 기준가 = 직전 거래일 **원주가** 종가. 원주가 range 를 조회해 previousCloseFromDaily 로 추출
//              (원주가는 불변이라 base 도 불변 → 여기서 캐싱 여지). 분봉이 원주가라 base 도 원주가여야 스케일이 맞는다.
import {
    chartDailyRange,
    subtractMonths,
    densifyMinutes,
    previousCloseFromDaily,
    RAW_DAILY_LOOKBACK_MONTHS,
    type DailyCandle,
    type MinuteCandle,
    type MarketCloses,
    type AdjustedDailyReader,
    type MinuteReader,
    type RawDailyReader,
} from "@trade-data-manager/market";

/**
 * /chart 응답 — 파생값 0(순수 시계열). 소비자(클라)가 domain 순수함수로 %·누적·임계count 를 계산한다.
 * daily 는 수정주가(일봉 pane), minutes 는 원주가 dense(당일), rawBase 는 원주가 전일종가(분봉 % 기준).
 */
export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandle[];
    rawBase: MarketCloses | null;
}

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
        return {
            stockCode,
            daily,
            minutes: densifyMinutes(rawMinutes),
            rawBase: previousCloseFromDaily(rawDaily, date),
        };
    }
}
