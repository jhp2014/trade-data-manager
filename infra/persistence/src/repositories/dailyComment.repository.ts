import { and, asc, eq } from "drizzle-orm";
import type { DailyComment, DailyCommentReader, DailyCommentStore } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyComments } from "../schema/curation.js";
import { dailyCommentToRow, rowToDailyComment } from "../mappers/dailyComment.js";

/** Drizzle 구현 — (trade_date, stock_code) 자연키. comment 가 키 밖이라 편집은 upsert/remove. */
export class DrizzleDailyCommentRepository implements DailyCommentReader, DailyCommentStore {
    constructor(private readonly db: Database) {}

    async upsert(comment: DailyComment): Promise<void> {
        // (date, stock) 충돌 시 comment·author·updated_at 갱신(사람이 고쳐 씀).
        await this.db
            .insert(dailyComments)
            .values(dailyCommentToRow(comment))
            .onConflictDoUpdate({
                target: [dailyComments.tradeDate, dailyComments.stockCode],
                set: { comment: comment.comment, author: comment.author, updatedAt: new Date() },
            });
    }

    async remove(date: string, stockCode: string): Promise<void> {
        await this.db
            .delete(dailyComments)
            .where(and(eq(dailyComments.tradeDate, date), eq(dailyComments.stockCode, stockCode)));
    }

    async getByDate(date: string): Promise<DailyComment[]> {
        const rows = await this.db
            .select()
            .from(dailyComments)
            .where(eq(dailyComments.tradeDate, date))
            .orderBy(asc(dailyComments.stockCode));
        return rows.map(rowToDailyComment);
    }
}
