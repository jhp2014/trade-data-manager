import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { ReviewPoint, ReviewPointListItem, ReviewPointReader, ReviewPointStore } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { reviewPoints } from "../schema/curation.js";
import { stockMaster } from "../schema/market.js";
import { reviewPointToRow, rowToReviewPoint } from "../mappers/reviewPoint.js";

/** Drizzle 구현 — (stock_code, trade_date, trade_time) 자연키. upsert 로 add/edit 겸함. */
export class DrizzleReviewPointRepository implements ReviewPointReader, ReviewPointStore {
    constructor(private readonly db: Database) {}

    async upsert(points: ReviewPoint[]): Promise<void> {
        if (points.length === 0) return;
        // (stock,date,time) 충돌 시 memo 만 갱신 — 자연키는 불변, memo 만 가변.
        await this.db
            .insert(reviewPoints)
            .values(points.map(reviewPointToRow))
            .onConflictDoUpdate({
                target: [reviewPoints.stockCode, reviewPoints.tradeDate, reviewPoints.tradeTime],
                set: { memo: sql`EXCLUDED.memo` },
            });
    }

    async listByChart(stockCode: string, date: string): Promise<ReviewPoint[]> {
        const rows = await this.db
            .select()
            .from(reviewPoints)
            .where(and(eq(reviewPoints.stockCode, stockCode), eq(reviewPoints.tradeDate, date)))
            .orderBy(asc(reviewPoints.tradeTime));
        return rows.map(rowToReviewPoint);
    }

    async listAllPoints(): Promise<ReviewPointListItem[]> {
        // 전체 타점 + 종목명(stock_master 조인). 날짜 내림차순, 같은 날 시각 오름차순.
        const rows = await this.db
            .select({
                stockCode: reviewPoints.stockCode,
                date: reviewPoints.tradeDate,
                time: reviewPoints.tradeTime,
                memo: reviewPoints.memo,
                name: stockMaster.name,
            })
            .from(reviewPoints)
            .leftJoin(stockMaster, eq(stockMaster.stockCode, reviewPoints.stockCode))
            .orderBy(desc(reviewPoints.tradeDate), asc(reviewPoints.tradeTime));
        return rows.map((r) => ({ stockCode: r.stockCode, date: r.date, time: r.time, memo: r.memo ?? undefined, name: r.name ?? null }));
    }

    async remove(stockCode: string, date: string, time: string): Promise<void> {
        await this.db
            .delete(reviewPoints)
            .where(
                and(
                    eq(reviewPoints.stockCode, stockCode),
                    eq(reviewPoints.tradeDate, date),
                    eq(reviewPoints.tradeTime, time),
                ),
            );
    }
}
