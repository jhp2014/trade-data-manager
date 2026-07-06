import type { DailyCandle } from "#domain";

/**
 * 원주가(미수정) 일봉 저장 포트(collect). 원주가는 사후 불변이라 **append-only**
 * (이미 저장된 (종목,날)은 유지 — onConflictDoNothing). 소급조정 자가치유가 이 저장소엔 닿지 않는다.
 * (읽기 조회는 query 의 RawDailyReader 로 분리 — 시총 백필(collect)도 그 read 포트를 공유한다.)
 */
export interface RawDailyStore {
    saveRawDailyCandles(candles: DailyCandle[]): Promise<void>;
}
