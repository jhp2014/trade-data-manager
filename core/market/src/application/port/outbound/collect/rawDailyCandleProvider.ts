import type { DailyCandle, DateRange } from "#domain";

/**
 * 원주가(미수정) 일봉 제공 포트(ISP — 원주가 수집만). 구현 = infra/broker(키움 upd_stkpc_tp:"0", KRX+_AL 머지).
 * DailyCandleProvider(수정주가)와 시그니처는 같지만 반환값이 원주가라 의도적으로 별도 포트로 분리한다
 * (소비자가 "원주가를 원한다"를 타입으로 명시). 시간 오름차순.
 */
export interface RawDailyCandleProvider {
    getRawDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]>;
}
