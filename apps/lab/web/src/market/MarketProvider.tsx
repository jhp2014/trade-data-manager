// 시장 데이터 구현 주입 — 앱은 tdm 구현, 테스트는 가짜 구현을 넣는다.
// 훅은 자기 종류의 창구만 꺼낸다(useChartData 는 ChartData 만 보인다).
import { createContext, useContext, type ReactNode } from "react";
import type { CalendarData, ChartData, Market, NewsData, StockData, TelegramData, ThemeData } from "./ports.js";

const MarketContext = createContext<Market | null>(null);

export function MarketProvider({ market, children }: { market: Market; children: ReactNode }): JSX.Element {
    return <MarketContext.Provider value={market}>{children}</MarketContext.Provider>;
}

function useMarket(): Market {
    const m = useContext(MarketContext);
    if (!m) throw new Error("MarketProvider 밖에서 시장 데이터를 찾았다");
    return m;
}

export const useChartData = (): ChartData => useMarket();
export const useStockData = (): StockData => useMarket();
export const useCalendarData = (): CalendarData => useMarket();
export const useThemeData = (): ThemeData => useMarket();
export const useNewsData = (): NewsData => useMarket();
export const useTelegramData = (): TelegramData => useMarket();
