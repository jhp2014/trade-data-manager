// 도메인 당일이슈 ↔ DB 행 매퍼. 거의 항등 — date/stock_code/issue/author 직결, created_at(부기)은 도메인에서 뗀다.
// comment 는 DB nullable(null) ↔ 도메인 optional(undefined).
import type { DailyIssue } from "@trade-data-manager/market";
import type { DailyIssueRow, DailyIssueInsert } from "../schema/market.js";

export function dailyIssueToRow(i: DailyIssue): DailyIssueInsert {
    return {
        tradeDate: i.date,
        stockCode: i.stockCode,
        issue: i.issue,
        comment: i.comment ?? null,
        author: i.author,
    };
}

export function rowToDailyIssue(r: DailyIssueRow): DailyIssue {
    return {
        date: r.tradeDate,
        stockCode: r.stockCode,
        issue: r.issue,
        comment: r.comment ?? undefined,
        author: r.author,
    };
}
