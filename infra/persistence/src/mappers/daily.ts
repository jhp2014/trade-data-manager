// 도메인 split(krx/un) ↔ DB flat 매퍼. 가격 integer↔Number, 거래량·거래대금 bigint↔String(BigInt).
// date 는 drizzle 가 무손실 string. 도메인은 무손실 string 계약 유지.
import type { DailyBar, DailyCandle } from "@trade-data-manager/market";
import type { DailyCandleRow, DailyCandleInsert } from "../schema/market.js";

export function dailyCandleToRow(c: DailyCandle): DailyCandleInsert {
    return {
        tradeDate: c.date,
        stockCode: c.stockCode,
        openKrx: Number(c.krx.open),
        highKrx: Number(c.krx.high),
        lowKrx: Number(c.krx.low),
        closeKrx: Number(c.krx.close),
        volumeKrx: BigInt(c.krx.volume),
        amountKrx: BigInt(c.krx.amount),
        openUn: Number(c.un.open),
        highUn: Number(c.un.high),
        lowUn: Number(c.un.low),
        closeUn: Number(c.un.close),
        volumeUn: BigInt(c.un.volume),
        amountUn: BigInt(c.un.amount),
    };
}

export function rowToDailyCandle(r: DailyCandleRow): DailyCandle {
    const krx: DailyBar = {
        open: String(r.openKrx),
        high: String(r.highKrx),
        low: String(r.lowKrx),
        close: String(r.closeKrx),
        volume: r.volumeKrx.toString(),
        amount: r.amountKrx.toString(),
    };
    const un: DailyBar = {
        open: String(r.openUn),
        high: String(r.highUn),
        low: String(r.lowUn),
        close: String(r.closeUn),
        volume: r.volumeUn.toString(),
        amount: r.amountUn.toString(),
    };
    return { stockCode: r.stockCode, date: r.tradeDate, krx, un };
}
