import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { AnchorCoord, PointAnchor, PointAnchorReader, PointAnchorStore, ReviewPointKey } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { pointAnchors } from "../schema/curation.js";
import { pointAnchorToRow, rowToPointAnchor } from "../mappers/pointAnchor.js";

/** Drizzle 구현 — 자연키 (타점, param, 좌표). 좌표 저장(값 아님) → in-place 수정 없음. */
export class DrizzlePointAnchorRepository implements PointAnchorReader, PointAnchorStore {
    constructor(private readonly db: Database) {}

    async put(anchor: PointAnchor, { replace }: { replace: boolean }): Promise<void> {
        const row = pointAnchorToRow(anchor);
        // 다중 param — 좌표가 정체성이라 같은 캔들 재지정은 멱등 no-op. (field/market 만 다른 재지정은
        // 다중 param 에 없다: 다중은 시각 앵커(무시 캔들)뿐이고, 생기면 그때 해제→재지정이 자연스럽다.)
        if (!replace) {
            await this.db.insert(pointAnchors).values(row).onConflictDoNothing();
            return;
        }
        // 단일 param — 좌표가 다른 옛 앵커를 남기면 그 param 이 둘이 된다. 교체는 delete+insert 가 유일한 방법이고
        // (onConflict 는 같은 좌표만 잡는다), 사이에 빈 상태가 보이면 축이 결손으로 굽으므로 트랜잭션으로 묶는다.
        await this.db.transaction(async (tx) => {
            await tx.delete(pointAnchors).where(and(...this.paramConds(anchor, anchor.param)));
            await tx.insert(pointAnchors).values(row);
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

    async remove(point: ReviewPointKey, param: string, coord?: AnchorCoord): Promise<void> {
        const conds = this.paramConds(point, param);
        if (coord !== undefined) {
            conds.push(eq(pointAnchors.anchorDate, coord.anchorDate));
            // 일봉 앵커는 anchor_time IS NULL — eq(null) 은 항상 거짓이라 조용히 아무것도 안 지운다.
            conds.push(coord.anchorTime === undefined ? isNull(pointAnchors.anchorTime) : eq(pointAnchors.anchorTime, coord.anchorTime));
        }
        await this.db.delete(pointAnchors).where(and(...conds));
    }

    /** (타점, param) 범위 — 교체·해제가 공유하는 술어. */
    private paramConds(point: ReviewPointKey, param: string): SQL[] {
        return [
            eq(pointAnchors.stockCode, point.stockCode),
            eq(pointAnchors.tradeDate, point.date),
            eq(pointAnchors.tradeTime, point.time),
            eq(pointAnchors.param, param),
        ];
    }
}
