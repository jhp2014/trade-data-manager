import { and, asc, eq } from "drizzle-orm";
import type { PointAnchor, PointAnchorReader, PointAnchorStore, ReviewPointKey } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { pointAnchors } from "../schema/curation.js";
import { pointAnchorToRow, rowToPointAnchor } from "../mappers/pointAnchor.js";

/** Drizzle 구현 — 자연키 (타점, param) upsert/remove. 좌표 저장(값 아님) → in-place 수정 없음. */
export class DrizzlePointAnchorRepository implements PointAnchorReader, PointAnchorStore {
    constructor(private readonly db: Database) {}

    async upsert(anchor: PointAnchor): Promise<void> {
        const row = pointAnchorToRow(anchor);
        await this.db
            .insert(pointAnchors)
            .values(row)
            .onConflictDoUpdate({
                target: [pointAnchors.stockCode, pointAnchors.tradeDate, pointAnchors.tradeTime, pointAnchors.param],
                set: { anchorDate: row.anchorDate, anchorTime: row.anchorTime, field: row.field, market: row.market },
            });
    }

    async listByChart(stockCode: string, date: string): Promise<PointAnchor[]> {
        const rows = await this.db
            .select()
            .from(pointAnchors)
            .where(and(eq(pointAnchors.stockCode, stockCode), eq(pointAnchors.tradeDate, date)))
            .orderBy(asc(pointAnchors.tradeTime), asc(pointAnchors.param));
        return rows.map(rowToPointAnchor);
    }

    async listAll(): Promise<PointAnchor[]> {
        const rows = await this.db.select().from(pointAnchors);
        return rows.map(rowToPointAnchor);
    }

    async remove(point: ReviewPointKey, param: string): Promise<void> {
        await this.db
            .delete(pointAnchors)
            .where(
                and(
                    eq(pointAnchors.stockCode, point.stockCode),
                    eq(pointAnchors.tradeDate, point.date),
                    eq(pointAnchors.tradeTime, point.time),
                    eq(pointAnchors.param, param),
                ),
            );
    }
}
