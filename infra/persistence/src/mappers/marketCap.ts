// 도메인 ↔ DB 매퍼. marketCap: 무손실 string ↔ bigint(네이티브 BigInt). date 는 drizzle 가 무손실 string.
import type { DailyMarketCap } from "@trade-data-manager/market";
import type { DailyMarketCapInsert, DailyMarketCapRow } from "../schema/market.js";

export function marketCapToRow(m: DailyMarketCap): DailyMarketCapInsert {
    return { stockCode: m.stockCode, tradeDate: m.date, marketCap: BigInt(m.marketCap) };
}

export function rowToMarketCap(r: DailyMarketCapRow): DailyMarketCap {
    return { stockCode: r.stockCode, date: r.tradeDate, marketCap: r.marketCap.toString() };
}
