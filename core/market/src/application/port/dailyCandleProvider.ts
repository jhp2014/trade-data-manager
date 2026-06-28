import type { DailyCandle } from "../../domain/index.js";

/** 일봉 조회 기간. YYYY-MM-DD, 양끝 포함(inclusive). */
export interface DateRange {
    from: string;
    to: string;
}

/**
 * 일봉 제공 포트(ISP — 일봉 능력만).
 * 구현은 infra 어댑터: 현재 키움 단독(KIS는 일봉 제공분 없음). KRX·UN 두 바는 어댑터 내부에서 머지.
 * 반환은 시간 오름차순. 등락률 기준가(전일종가)는 포트가 주지 않으며,
 * 필요한 use case 가 직전 거래일 캔들 close 에서 시장별로 파생한다.
 */
export interface DailyCandleProvider {
    getDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]>;
}
