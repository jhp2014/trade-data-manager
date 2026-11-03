// GET /stocks/:code — 종목 이름표·상장일(마스터) + 일별 시총 시계열(daily_market_cap 행 그대로). tdm-ai 가 「차트 날짜 기준 시총」(as-of)을
// 고르려고 받는다 — D-1 규칙(아침 시총 = date < D 마지막 줄)은 소비자가 적용한다(서버가 미리 밀면 원값을 잃는다).
import type { DailyMarketCapSeriesReader, DateRange, StockMasterReader } from "@trade-data-manager/market";
import type { LabStockInfo } from "@trade-data-manager/wire";

export interface StockInfoDeps {
    master: Pick<StockMasterReader, "getByStockCodes">;
    marketCap: DailyMarketCapSeriesReader;
}

/** null = 마스터에 없는 코드(경로가 404 로 바꾼다). 범위 안 시총이 없으면 marketCap 은 빈 배열. */
export type StockInfoByCode = (stockCode: string, range: Partial<DateRange>) => Promise<LabStockInfo | null>;

export function makeStockInfo({ master, marketCap }: StockInfoDeps): StockInfoByCode {
    return async (code, range) => {
        const [masters, caps] = await Promise.all([master.getByStockCodes([code]), marketCap.getMarketCapSeries(code, range)]);
        const m = masters.find((x) => x.stockCode === code);
        if (!m) return null;
        return {
            stockCode: m.stockCode,
            name: m.name,
            market: m.market,
            listedAt: m.listingDate,
            marketCap: caps.map((c) => ({ date: c.date, cap: c.marketCap })),
        };
    };
}
