import type { DailyStockStat } from "#domain";

/**
 * 그 거래일의 **전종목** 일별 속성 소스(시총·상장주식수·소속부).
 * 낟알이 종목이 아니라 **날짜** 다 — 소스(KRX 일별매매정보)가 하루치 전종목을 한 응답으로 주기 때문이고,
 * 그래서 수집이 종목 fan-out 없이 날짜 fan-out 하나로 끝난다.
 * 시장 분리(유가증권/코스닥)는 어댑터 안에 숨는다 — 도메인은 "그 날 전종목"만 안다.
 */
export interface DailyStockStatsProvider {
    /** 휴장일·미제공일이면 빈 배열(에러 아님). */
    getDailyStats(date: string): Promise<DailyStockStat[]>;
}
