// 도메인 당일코멘트 ↔ DB 행 매퍼. date/stock_code/comment/author 직결.
// created_at/updated_at(부기)은 도메인에서 뗀다(DB default now() / upsert 시 갱신).
import type { DailyComment } from "@trade-data-manager/market";
import type { DailyCommentRow, DailyCommentInsert } from "../schema/curation.js";

export function dailyCommentToRow(c: DailyComment): DailyCommentInsert {
    return {
        tradeDate: c.date,
        stockCode: c.stockCode,
        comment: c.comment,
        author: c.author,
    };
}

export function rowToDailyComment(r: DailyCommentRow): DailyComment {
    return {
        date: r.tradeDate,
        stockCode: r.stockCode,
        comment: r.comment,
        author: r.author,
    };
}
