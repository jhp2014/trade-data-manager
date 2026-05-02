/**
 * 통계 계산 및 DB 컬럼 생성에 사용되는 등락률 구간 (단위: %)
 * - 현재 minute_candle_features에서 직접 사용하는 곳은 없음
 * - 향후 trading_opportunities, 동적 쿼리에서 참조 가능
 */
export const STAT_RATES = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28
] as const;

/**
 * 통계 계산 및 DB 컬럼 생성에 사용되는 분봉 거래대금 구간 (단위: 억)
 * - minute_candle_features의 cnt{a}Amt 컬럼에 사용
 */
export const STAT_AMOUNTS = [
    20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300
] as const;

export const STAT_PIVOT_HIGH = [20, 30, 40, 50, 60, 80, 100, 120] as const;

export const STAT_SIMPLE_HIGH = [20, 30, 40] as const;

/**
 * trading_opportunities 테이블의 슬롯(S1~SN) 수
 */
export const MAX_SLOT_COUNT = 6;
