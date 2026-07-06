import type { MinuteCandle } from "#domain";

/**
 * 분봉 조회(query) — (종목, 하루) 시계열. 파생값(분봉거래대금·누적·등락률)은
 * 저장하지 않고 소비측이 도메인 순수함수(price.ts)로 계산한다.
 */
export interface MinuteReader {
    getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]>;
}
