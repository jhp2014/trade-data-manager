/**
 * 통계 계산 및 DB 컬럼 생성에 사용되는 등락률 구간 (단위: %)
 */
export const STAT_RATES = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28
] as const;

/**
 * 통계 계산 및 DB 컬럼 생성에 사용되는 분봉 거래대금 구간 (단위: 억)
 */
export const STAT_AMOUNTS = [
    20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300
] as const;

/**
 * 누적 거래대금 통계 구간 (단위: 억)
 * - 단순 카운트(cntCum{a}AmtStockNum) 컬럼에 사용
 * - 등락률 조합(cntCum{a}AmtRate{r}StockNum) 컬럼에 사용
 */
export const STAT_CUM_AMOUNTS = [
    200, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 3000
] as const;

/**
 * 누적 거래대금 × 등락률 조합용 등락률 구간 (단위: %)
 * STAT_RATES와 별도로 두는 이유: 조합 컬럼 수 폭증 방지 (10 × 5 = 50)
 */
export const STAT_COMBO_RATES = [4, 5, 6, 7, 8] as const;

/**
 * 일봉 고가 관리 관련 상수
 */
export const STAT_PIVOT_HIGH = [20, 30, 40, 50, 60, 80, 100, 120] as const;

export const STAT_SIMPLE_HIGH = [20, 30, 40] as const;

/**
 * trading_opportunities 테이블의 슬롯(S1~SN) 수
 */
export const MAX_SLOT_COUNT = 6;
