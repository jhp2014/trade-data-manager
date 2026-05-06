import type { Database } from "../db";
import type { MinuteCandle } from "../schema/market";
import {
    findDailyCandleByStockAndDate,
} from "../repositories/daily-candle.repository";
import {
    findDistinctStockCodesByDate,
    findMinuteCandlesByStockAndDate,
} from "../repositories/minute-candle.repository";

/**
 * 일봉 한 건 조회 (id, prevClose 만 반환 — 분봉 저장용).
 */
export function getDailyCandle(
    db: Database,
    params: { stockCode: string; tradeDate: string },
) {
    return findDailyCandleByStockAndDate(db, params.stockCode, params.tradeDate);
}

/**
 * 특정 거래일에 분봉이 기록된 종목 코드 목록.
 */
export function getStockCodesByDate(
    db: Database,
    params: { tradeDate: string },
): Promise<string[]> {
    return findDistinctStockCodesByDate(db, params.tradeDate);
}

/**
 * 특정 종목 + 거래일의 분봉 (시간 ASC).
 */
export function getMinuteCandles(
    db: Database,
    params: { stockCode: string; tradeDate: string },
): Promise<MinuteCandle[]> {
    return findMinuteCandlesByStockAndDate(db, params.stockCode, params.tradeDate);
}
