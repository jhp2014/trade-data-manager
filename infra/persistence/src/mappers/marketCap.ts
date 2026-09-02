// 도메인 ↔ DB 매퍼. 수치는 무손실 string ↔ bigint(네이티브 BigInt). date 는 drizzle 가 무손실 string.
import type { DailyMarketCap, DailyStockStat } from "@trade-data-manager/market";
import type { DailyMarketCapInsert, DailyMarketCapRow } from "../schema/market.js";

export function rowToMarketCap(r: DailyMarketCapRow): DailyMarketCap {
    return { stockCode: r.stockCode, date: r.tradeDate, marketCap: r.marketCap.toString() };
}

export function dailyStatToRow(s: DailyStockStat): DailyMarketCapInsert {
    return {
        stockCode: s.stockCode,
        tradeDate: s.date,
        marketCap: BigInt(s.marketCap),
        listShares: BigInt(s.listShares),
        sectTpNm: s.sectTpNm,
    };
}

export function rowToDailyStat(r: DailyMarketCapRow): DailyStockStat {
    return {
        stockCode: r.stockCode,
        date: r.tradeDate,
        marketCap: r.marketCap.toString(),
        listShares: r.listShares.toString(),
        sectTpNm: r.sectTpNm,
    };
}
