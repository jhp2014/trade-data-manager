/**
 * 통계 계산 및 DB 컬럼 생성에 사용되는 분봉 거래대금 구간 (단위: 억)
 * - minute_candle_features의 cnt{a}Amt 컬럼에 사용
 */
export const STAT_AMOUNTS = [
    20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300
] as const;