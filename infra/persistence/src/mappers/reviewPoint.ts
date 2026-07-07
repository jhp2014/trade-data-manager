// 도메인 복기타점 ↔ DB 행 매퍼. 거의 항등 — date/time/stock_code 직결. memo 는 null↔undefined.
import type { ReviewPoint } from "@trade-data-manager/market";
import type { ReviewPointRow, ReviewPointInsert } from "../schema/curation.js";

export function reviewPointToRow(p: ReviewPoint): ReviewPointInsert {
    return {
        stockCode: p.stockCode,
        tradeDate: p.date,
        tradeTime: p.time,
        type: p.type ?? null,
        outcome: p.outcome ?? null,
        memo: p.memo ?? null,
    };
}

export function rowToReviewPoint(r: ReviewPointRow): ReviewPoint {
    return {
        stockCode: r.stockCode,
        date: r.tradeDate,
        time: r.tradeTime,
        type: r.type ?? undefined,
        outcome: r.outcome ?? undefined,
        memo: r.memo ?? undefined,
    };
}
