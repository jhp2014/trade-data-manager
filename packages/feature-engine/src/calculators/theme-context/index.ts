import type { ThemeContextCalculator } from "../../types";
import { ContextStockCodeCalculator } from "./ContextStockCodeCalculator";
import { ContextTradeDateCalculator } from "./ContextTradeDateCalculator";
import { ContextTradeTimeCalculator } from "./ContextTradeTimeCalculator";
import { RankByRateKrxCalculator } from "./RankByRateKrxCalculator";
import { RankByRateNxtCalculator } from "./RankByRateNxtCalculator";
import { RankByCumulativeTradingAmountCalculator } from "./RankByCumulativeTradingAmountCalculator";

export {
    ContextStockCodeCalculator,
    ContextTradeDateCalculator,
    ContextTradeTimeCalculator,
    RankByRateKrxCalculator,
    RankByRateNxtCalculator,
    RankByCumulativeTradingAmountCalculator,
};

/**
 * 테마 종목 컨텍스트 Calculator 등록 목록.
 * 한 시각에 한 테마 안에서 각 종목의 위치/순위 정보를 생성.
 */
export const THEME_CONTEXT_CALCULATORS: ThemeContextCalculator[] = [
    new ContextStockCodeCalculator(),
    new ContextTradeDateCalculator(),
    new ContextTradeTimeCalculator(),

    new RankByRateKrxCalculator(),
    new RankByRateNxtCalculator(),
    new RankByCumulativeTradingAmountCalculator(),
];
