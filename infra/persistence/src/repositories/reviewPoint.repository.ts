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
        // (stock,date,time) 충돌 시 가변 속성(type·outcome·memo) 갱신 — 자연키만 불변.
        // 전체 덮어쓰기 계약: 클라가 현재 상태를 합쳐 full point 를 보낸다(부분갱신 아님).
        await this.db
            .insert(reviewPoints)
            .values(points.map(reviewPointToRow))
            .onConflictDoUpdate({
                target: [reviewPoints.stockCode, reviewPoints.tradeDate, reviewPoints.tradeTime],
                set: {
                    type: sql`EXCLUDED.type`,
                    outcome: sql`EXCLUDED.outcome`,
                    memo: sql`EXCLUDED.memo`,
                },
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
                type: reviewPoints.type,
                outcome: reviewPoints.outcome,
                memo: reviewPoints.memo,
                name: stockMaster.name,
            })
            .from(reviewPoints)
            .leftJoin(stockMaster, eq(stockMaster.stockCode, reviewPoints.stockCode))
            .orderBy(desc(reviewPoints.tradeDate), asc(reviewPoints.tradeTime));
        return rows.map((r) => ({
            stockCode: r.stockCode,
            date: r.date,
            time: r.time,
            type: r.type ?? undefined,
            outcome: r.outcome ?? undefined,
            memo: r.memo ?? undefined,
            name: r.name ?? null,
        }));
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
