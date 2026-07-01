import type { DateRange, RawDailyClose } from "#domain";

/**
 * 원주가(미수정) 일별 종가 제공 포트(ISP — 시총 백필 전용).
 * 저장 일봉은 수정주가라 시총엔 부적합 → 별도 원주가 경로(키움 upd_stkpc_tp:"0", KRX). 시간 오름차순.
 */
export interface RawDailyCloseProvider {
    getRawCloses(stockCode: string, range: DateRange): Promise<RawDailyClose[]>;
}
