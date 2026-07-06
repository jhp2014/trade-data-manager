import type { DailyCandle, DateRange, PreviousClose } from "#domain";

/**
 * 수정주가 일봉 조회(query) — 차트 일봉 pane 용 [from,to] 시계열(시간 오름차순). 구현은 Drizzle 일봉 repo.
 */
export interface AdjustedDailyReader {
    getDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]>;
}

/**
 * 당일 요약 스냅샷용 일봉 배치 read(query) — 코드 배치 조회 전용.
 * 검수 read 소비자(api DayBoards/DerivedCache 등)만 의존하고 collect 쪽 store 는 안 건드리게 분리한다.
 */
export interface DailyCandleSnapshotReader {
    /** 그 거래일 일봉을 코드 배치로. 없는 코드는 결과에서 빠짐. */
    getByDateAndCodes(date: string, codes: string[]): Promise<DailyCandle[]>;
    /** 각 코드의 직전 거래일 종가(등락률 기준가) — date 이전 최신 캔들의 시장별 close. 없는 코드는 빠짐. */
    getPreviousCloses(date: string, codes: string[]): Promise<PreviousClose[]>;
}
