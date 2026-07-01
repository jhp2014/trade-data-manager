import { and, asc, eq } from "drizzle-orm";
import type { DailyIssue, DailyIssueRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyIssues } from "../schema/curation.js";
import { dailyIssueToRow, rowToDailyIssue } from "../mappers/dailyIssue.js";

/** Drizzle 구현 — (trade_date, stock_code, issue) 자연키. 편집모델은 행 단위 add/delete(in-place 수정 없음). */
export class DrizzleDailyIssueRepository implements DailyIssueRepository {
    constructor(private readonly db: Database) {}

    async add(issues: DailyIssue[]): Promise<void> {
        if (issues.length === 0) return;
        // ON CONFLICT DO NOTHING — 이미 있는 행(사람 편집)을 안 덮는다. DO NOTHING 은 배치 내 동일키 중복도 에러 없이 흡수.
        await this.db.insert(dailyIssues).values(issues.map(dailyIssueToRow)).onConflictDoNothing();
    }

    async remove(date: string, stockCode: string, issue: string): Promise<void> {
        await this.db
            .delete(dailyIssues)
            .where(
                and(
                    eq(dailyIssues.tradeDate, date),
                    eq(dailyIssues.stockCode, stockCode),
                    eq(dailyIssues.issue, issue),
                ),
            );
    }

    async getByDate(date: string): Promise<DailyIssue[]> {
        const rows = await this.db
            .select()
            .from(dailyIssues)
            .where(eq(dailyIssues.tradeDate, date))
            .orderBy(asc(dailyIssues.issue), asc(dailyIssues.stockCode));
        return rows.map(rowToDailyIssue);
    }
}
