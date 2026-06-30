/**
 * 당일 universe 조회 포트(outbound). universe = 그날 분봉이 있는 종목 = minute_candles WHERE trade_date=D distinct.
 * 별도 랭킹/스냅샷 테이블 없이 코드 목록만 — 랭킹이 필요하면 캔들 위 도메인 순수함수로(저장X).
 * 구현은 infra/persistence 의 별도 작은 클래스(분봉 repo 와 책임이 달라 분리).
 */
export interface DailyUniverseProvider {
    /** 그 거래일에 분봉이 존재한 종목코드들(distinct). YYYY-MM-DD. */
    stockCodesByDate(date: string): Promise<string[]>;
}
