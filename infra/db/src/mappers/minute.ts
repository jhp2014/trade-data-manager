// 도메인 split(krx nullable/un) ↔ DB flat 매퍼. krx 부재(프리마켓 등)는 null 컬럼으로.
import type { MinuteBar, MinuteCandle } from "@trade-data-manager/market";
import type { MinuteCandleRow, MinuteCandleInsert } from "../schema/market.js";

export function minuteCandleToRow(c: MinuteCandle): MinuteCandleInsert {
    return {
        tradeDate: c.date,
        stockCode: c.stockCode,
        tradeTime: c.time,
        openUn: c.un.open,
        highUn: c.un.high,
        lowUn: c.un.low,
        closeUn: c.un.close,
        volumeUn: c.un.volume,
        openKrx: c.krx?.open ?? null,
        highKrx: c.krx?.high ?? null,
        lowKrx: c.krx?.low ?? null,
        closeKrx: c.krx?.close ?? null,
        volumeKrx: c.krx?.volume ?? null,
    };
}

export function rowToMinuteCandle(r: MinuteCandleRow): MinuteCandle {
    const un: MinuteBar = {
        open: r.openUn,
        high: r.highUn,
        low: r.lowUn,
        close: r.closeUn,
        volume: r.volumeUn,
    };
    // KRX 컬럼이 하나라도 채워져 있으면 KRX 바 존재. (UN⊇KRX 라 부재 시 전부 null.)
    const krx: MinuteBar | null =
        r.closeKrx === null
            ? null
            : {
                  open: r.openKrx!,
                  high: r.highKrx!,
                  low: r.lowKrx!,
                  close: r.closeKrx,
                  volume: r.volumeKrx!,
              };
    return { stockCode: r.stockCode, date: r.tradeDate, time: r.tradeTime, krx, un };
}
