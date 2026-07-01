// ChartReadService — (종목, 날짜) → 일봉2년 + 당일 dense분봉 raw 번들. 읽기 Query.
// raw 만 내려주고 %·누적·임계count 파생은 소비자(클라)가 domain 순수함수로 한다.
// 분봉은 여기서 densifyMinutes 를 서버 실행해 채움정책(VI/무거래 flat-fill)을 도메인 단일진실로 강제한다
// — 소비자가 제멋대로 채우지 못하게. 분봉 % 기준가(직전 거래일 종가)는 일봉 번들에 이미 있어 별도 조회하지 않는다.
import type { DailyCandleRepository, MinuteCandleRepository } from "#port/outbound";
import type { ChartBundle, ChartReader } from "#port/inbound";
import { densifyMinutes } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "../shared/dailyRange.js";

/** 벌크 조회 인플라이트 상한 — 종목당 2년치 일봉이라 네트워크 대기를 겹쳐 채우는 용도. */
const CHART_FETCH_CONCURRENCY = 8;

export interface ChartReadDeps {
    dailyCandle: DailyCandleRepository;
    minuteCandle: MinuteCandleRepository;
}

export class ChartReadService implements ChartReader {
    constructor(private readonly deps: ChartReadDeps) {}

    async chartByCode(stockCode: string, date: string): Promise<ChartBundle> {
        const { dailyCandle, minuteCandle } = this.deps;
        const [daily, rawMinutes] = await Promise.all([
            dailyCandle.getDailyCandles(stockCode, chartDailyRange(date)),
            minuteCandle.getMinuteCandles(stockCode, date),
        ]);
        return { stockCode, daily, minutes: densifyMinutes(rawMinutes) };
    }

    async chartsByCodes(stockCodes: string[], date: string): Promise<ChartBundle[]> {
        return mapWithConcurrency(stockCodes, CHART_FETCH_CONCURRENCY, (code) =>
            this.chartByCode(code, date),
        );
    }
}
