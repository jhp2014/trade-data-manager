import type { ThemeFeatureCalculator } from "../../types";
import { ThemeIdCalculator } from "./ThemeIdCalculator";
import { ThemeTradeDateCalculator } from "./ThemeTradeDateCalculator";
import { ThemeTradeTimeCalculator } from "./ThemeTradeTimeCalculator";
import { StockCountCalculator } from "./StockCountCalculator";
import { AvgRateCalculator } from "./AvgRateCalculator";
import { AvgPullbackCalculator } from "./AvgPullbackCalculator";
import { RateCountCalculator } from "./RateCountCalculator";
import { AmountCountStockCalculator } from "./AmountCountStockCalculator";
import { CumAmountCountStockCalculator } from "./CumAmountCountStockCalculator";
import { CumAmountRateCountCalculator } from "./CumAmountRateCountCalculator";
import {
    STAT_RATES,
    STAT_AMOUNTS,
    STAT_CUM_AMOUNTS,
    STAT_COMBO_RATES,
} from "../../constants";

export {
    ThemeIdCalculator,
    ThemeTradeDateCalculator,
    ThemeTradeTimeCalculator,
    StockCountCalculator,
    AvgRateCalculator,
    AvgPullbackCalculator,
    RateCountCalculator,
    AmountCountStockCalculator,
    CumAmountCountStockCalculator,
    CumAmountRateCountCalculator,
};

/**
 * 누적 거래대금 × 등락률 조합 calculator 인스턴스 생성.
 * STAT_CUM_AMOUNTS(10) × STAT_COMBO_RATES(5) = 50개 인스턴스.
 */
const cumAmountRateCalculators = STAT_CUM_AMOUNTS.flatMap((cumAmt) =>
    STAT_COMBO_RATES.map((rate) => new CumAmountRateCountCalculator(cumAmt, rate))
);

/**
 * 테마 피처 가공 Calculator 등록 목록.
 *
 * 컬럼 그룹:
 *   1. 식별 (themeId, tradeDate, tradeTime)
 *   2. 기본 통계 (cntTotalStock, avgRate, avgPullback)
 *   3. 등락률 분포 (STAT_RATES, 22개)
 *   4. 분봉 거래대금 분포 (STAT_AMOUNTS, 16개)
 *   5. 누적 거래대금 분포 (STAT_CUM_AMOUNTS, 10개)
 *   6. 누적 × 등락률 조합 (10 × 5 = 50개)
 */
export const THEME_FEATURE_CALCULATORS: ThemeFeatureCalculator[] = [
    // 1. 식별
    new ThemeIdCalculator(),
    new ThemeTradeDateCalculator(),
    new ThemeTradeTimeCalculator(),

    // 2. 기본 통계
    new StockCountCalculator(),
    new AvgRateCalculator(),
    new AvgPullbackCalculator(),

    // 3. 등락률 분포
    ...STAT_RATES.map((r) => new RateCountCalculator(r)),

    // 4. 분봉 거래대금 분포
    ...STAT_AMOUNTS.map((a) => new AmountCountStockCalculator(a)),

    // 5. 누적 거래대금 분포
    ...STAT_CUM_AMOUNTS.map((a) => new CumAmountCountStockCalculator(a)),

    // 6. 누적 × 등락률 조합
    ...cumAmountRateCalculators,
];
