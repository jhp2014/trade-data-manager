// 도메인 StockMaster ↔ DB row 매퍼. date 는 drizzle 가 무손실 string|null.
// ipoPrice(공모가 원)는 integer↔Number 변환, 도메인은 string|null 유지.
import type { StockMaster } from "@trade-data-manager/market";
import type { StockMasterRow, StockMasterInsert } from "../schema/market.js";

export function stockMasterToRow(m: StockMaster): StockMasterInsert {
    return {
        stockCode: m.stockCode,
        name: m.name,
        market: m.market,
        listingDate: m.listingDate,
        ipoPrice: m.ipoPrice === null ? null : Number(m.ipoPrice),
    };
}

export function rowToStockMaster(r: StockMasterRow): StockMaster {
    return {
        stockCode: r.stockCode,
        name: r.name,
        market: r.market,
        listingDate: r.listingDate,
        ipoPrice: r.ipoPrice === null ? null : String(r.ipoPrice),
    };
}
