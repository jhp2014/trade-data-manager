// 도메인 split(krx nullable/un) ↔ DB flat 매퍼. krx 부재(프리마켓 등)는 null 컬럼으로.
// 수치 변환: 가격 integer↔Number, 거래량 bigint↔String(BigInt). 도메인은 무손실 string 유지.
import type { MinuteBar, MinuteCandle } from "@trade-data-manager/market";
import type { MinuteCandleRow, MinuteCandleInsert } from "../schema/market.js";

export function minuteCandleToRow(c: MinuteCandle): MinuteCandleInsert {
    return {
        tradeDate: c.date,
        stockCode: c.stockCode,
        tradeTime: c.time,
        openUn: Number(c.un.open),
        highUn: Number(c.un.high),
        lowUn: Number(c.un.low),
        closeUn: Number(c.un.close),
        volumeUn: BigInt(c.un.volume),
        openKrx: c.krx ? Number(c.krx.open) : null,
        highKrx: c.krx ? Number(c.krx.high) : null,
        lowKrx: c.krx ? Number(c.krx.low) : null,
        closeKrx: c.krx ? Number(c.krx.close) : null,
        volumeKrx: c.krx ? BigInt(c.krx.volume) : null,
    };
}

export function rowToMinuteCandle(r: MinuteCandleRow): MinuteCandle {
    const un: MinuteBar = {
        open: String(r.openUn),
        high: String(r.highUn),
        low: String(r.lowUn),
        close: String(r.closeUn),
        volume: r.volumeUn.toString(),
    };
    // KRX 컬럼이 하나라도 채워져 있으면 KRX 바 존재. (UN⊇KRX 라 부재 시 전부 null.)
    const krx: MinuteBar | null =
        r.closeKrx === null
            ? null
            : {
                  open: String(r.openKrx!),
                  high: String(r.highKrx!),
                  low: String(r.lowKrx!),
                  close: String(r.closeKrx),
                  volume: r.volumeKrx!.toString(),
              };
    return { stockCode: r.stockCode, date: r.tradeDate, time: r.tradeTime, krx, un };
}
