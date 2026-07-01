// 도메인 가격선 ↔ DB 행 매퍼. price: 무손실 string ↔ integer(원). id: bigint ↔ string.
// 신규(미저장) 선은 id 가 undefined → insert 시 컬럼 생략(DB serial 이 부여). date 는 drizzle 가 무손실 string.
import type { PriceLine } from "@trade-data-manager/market";
import type { PriceLineRow, PriceLineInsert } from "../schema/curation.js";

export function priceLineToRow(l: PriceLine): PriceLineInsert {
    return {
        ...(l.id !== undefined ? { id: BigInt(l.id) } : {}),
        stockCode: l.stockCode,
        tradeDate: l.date,
        price: Number(l.price),
        memo: l.memo ?? null,
    };
}

export function rowToPriceLine(r: PriceLineRow): PriceLine {
    return {
        id: r.id.toString(),
        stockCode: r.stockCode,
        date: r.tradeDate,
        price: String(r.price),
        memo: r.memo ?? undefined,
    };
}
