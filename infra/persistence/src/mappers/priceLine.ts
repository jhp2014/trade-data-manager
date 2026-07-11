// 도메인 가격선 ↔ DB 행 매퍼. 앵커(날짜/시각/필드) 저장 — 가격은 저장하지 않는다(표시 시점 캔들에서 읽음).
// insert 입력은 NewPriceLine(id 없음 — DB serial 이 부여), 조회 결과는 PriceLine(id 항상 존재).
// date/time 은 drizzle 가 무손실 string. anchorTime NULL↔undefined.
import type { NewPriceLine, PriceLine, PriceLineField } from "@trade-data-manager/market";
import type { PriceLineRow, PriceLineInsert } from "../schema/curation.js";

export function priceLineToRow(l: NewPriceLine): PriceLineInsert {
    return {
        stockCode: l.stockCode,
        tradeDate: l.date,
        anchorDate: l.anchorDate,
        anchorTime: l.anchorTime ?? null,
        field: l.field,
        memo: l.memo ?? null,
    };
}

export function rowToPriceLine(r: PriceLineRow): PriceLine {
    return {
        id: r.id.toString(),
        stockCode: r.stockCode,
        date: r.tradeDate,
        anchorDate: r.anchorDate,
        anchorTime: r.anchorTime ?? undefined,
        field: r.field as PriceLineField,
        memo: r.memo ?? undefined,
    };
}
