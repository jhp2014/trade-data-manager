// 도메인 StockMaster ↔ DB row 매퍼. date/numeric 은 drizzle 가 무손실 string|null 로 주고받는다.
import type { StockMaster } from "@trade-data-manager/market";
import type { StockMasterRow, StockMasterInsert } from "../schema/market.js";

export function stockMasterToRow(m: StockMaster): StockMasterInsert {
    return {
        stockCode: m.stockCode,
        name: m.name,
        market: m.market,
        listingDate: m.listingDate,
        ipoPrice: m.ipoPrice,
    };
}

export function rowToStockMaster(r: StockMasterRow): StockMaster {
    return {
        stockCode: r.stockCode,
        name: r.name,
        market: r.market,
        listingDate: r.listingDate,
        ipoPrice: r.ipoPrice,
    };
}
