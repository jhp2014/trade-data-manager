import type { DailyCandle, DateRange } from "#domain";

/**
 * 원주가 일봉 조회(query) — [from,to] 원주가 시계열(날짜 오름차순).
 * 쓰임: 분봉 % 기준(직전 원종가, previousCloseFromDaily 로 range 에서 추출) + 복기 deriveMinutes.
 * 시총 백필(collect)도 원주가를 읽어 이 read 포트를 공유한다(collect→query 한 방향 의존).
 */
export interface RawDailyReader {
    getRawDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]>;
}
