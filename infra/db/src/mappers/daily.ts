// 도메인 split(krx/un) ↔ DB flat 매퍼. numeric/date 는 drizzle 가 무손실 string 으로 주고받아 도메인 string 과 직결.
import type { DailyBar, DailyCandle } from "@trade-data-manager/market";
import type { DailyCandleRow, DailyCandleInsert } from "../schema/market.js";

export function dailyCandleToRow(c: DailyCandle): DailyCandleInsert {
    return {
        tradeDate: c.date,
        stockCode: c.stockCode,
        openKrx: c.krx.open,
        highKrx: c.krx.high,
        lowKrx: c.krx.low,
        closeKrx: c.krx.close,
        volumeKrx: c.krx.volume,
        amountKrx: c.krx.amount,
        openUn: c.un.open,
        highUn: c.un.high,
        lowUn: c.un.low,
        closeUn: c.un.close,
        volumeUn: c.un.volume,
        amountUn: c.un.amount,
    };
}

export function rowToDailyCandle(r: DailyCandleRow): DailyCandle {
    const krx: DailyBar = {
        open: r.openKrx,
        high: r.highKrx,
        low: r.lowKrx,
        close: r.closeKrx,
        volume: r.volumeKrx,
        amount: r.amountKrx,
    };
    const un: DailyBar = {
        open: r.openUn,
        high: r.highUn,
        low: r.lowUn,
        close: r.closeUn,
        volume: r.volumeUn,
        amount: r.amountUn,
    };
    return { stockCode: r.stockCode, date: r.tradeDate, krx, un };
}
