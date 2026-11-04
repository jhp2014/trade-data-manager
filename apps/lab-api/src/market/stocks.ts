// 종목 경로의 조립 — 「누구냐」 GET /stocks(이름표 + 상장일 전량) · 「날짜별로 얼마냐」 GET /marketcap(일별 시총 시계열).
// 둘 다 행을 wire 이름으로만 옮긴다(listingDate→listedAt, marketCap→cap). 시총은 daily_market_cap 행 그대로 —
// tdm-ai 가 「차트 날짜 기준 시총」(as-of)을 고른다: D-1 규칙(아침 시총 = date < D 마지막 줄)은 소비자 몫(서버가 미리 밀면 원값을 잃는다).
import type { DailyMarketCapSeriesReader, DateRange, StockMasterListingReader } from "@trade-data-manager/market";
import type { LabStockRow, StockMarketCapPoint } from "@trade-data-manager/wire";

export type ListStocks = () => Promise<LabStockRow[]>;
/** 범위 양끝 포함, 날짜 오름차순. 범위 안 행이 없으면 빈 배열. */
export type MarketCapSeries = (stockCode: string, range: DateRange) => Promise<StockMarketCapPoint[]>;

export function makeListStocks(master: StockMasterListingReader): ListStocks {
    return async () =>
        (await master.listAllListings()).map((m) => ({ stockCode: m.stockCode, name: m.name, market: m.market, listedAt: m.listingDate }));
}

export function makeMarketCapSeries(marketCap: DailyMarketCapSeriesReader): MarketCapSeries {
    return async (code, range) => (await marketCap.getMarketCapSeries(code, range)).map((c) => ({ date: c.date, cap: c.marketCap }));
}
