// ChartReadService — (종목, 날짜) → 일봉2년(수정주가) + 당일 dense분봉(원주가) + 원주가 전일종가(rawBase) 번들. 읽기 Query.
// raw 만 내려주고 %·누적·임계count 파생은 소비자(클라)가 domain 순수함수로 한다.
// 분봉은 여기서 densifyMinutes 를 서버 실행해 채움정책(VI/무거래 flat-fill)을 도메인 단일진실로 강제한다.
// 분봉 % 기준가는 **원주가 전일종가**(rawBase)를 스칼라로 실어준다 — 분봉이 원주가라 base 도 원주가여야 스케일이 맞고,
// 그러려고 전체 원주가 일봉을 나를 필요 없이 직전 거래일 한 줄만 조회한다(일봉 3개 쿼리는 Promise.all 병렬).
import type {
    DailyCandleRepository,
    MinuteCandleRepository,
    RawDailyCandleRepository,
} from "#port/outbound";
import type { ChartBundle, ChartReader } from "#port/inbound";
import { densifyMinutes } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "../shared/dailyRange.js";

/** 벌크 조회 인플라이트 상한 — 종목당 2년치 일봉이라 네트워크 대기를 겹쳐 채우는 용도. */
const CHART_FETCH_CONCURRENCY = 8;

export interface ChartReadDeps {
    dailyCandle: DailyCandleRepository;
    minuteCandle: MinuteCandleRepository;
    rawDailyCandle: RawDailyCandleRepository;
}

export class ChartReadService implements ChartReader {
    constructor(private readonly deps: ChartReadDeps) {}

    async chartByCode(stockCode: string, date: string): Promise<ChartBundle> {
        const { dailyCandle, minuteCandle, rawDailyCandle } = this.deps;
        const [daily, rawMinutes, rawBase] = await Promise.all([
            dailyCandle.getDailyCandles(stockCode, chartDailyRange(date)),
            minuteCandle.getMinuteCandles(stockCode, date),
            rawDailyCandle.getPreviousRawClose(stockCode, date),
        ]);
        return { stockCode, daily, minutes: densifyMinutes(rawMinutes), rawBase };
    }

    async chartsByCodes(stockCodes: string[], date: string): Promise<ChartBundle[]> {
        return mapWithConcurrency(stockCodes, CHART_FETCH_CONCURRENCY, (code) =>
            this.chartByCode(code, date),
        );
    }
}
