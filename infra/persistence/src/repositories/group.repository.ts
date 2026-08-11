import { and, asc, eq, sql } from "drizzle-orm";
import type { Group, GroupAttachment, ChartGroupAttachment, ChartRef, ReviewPointKey, GroupReader, GroupStore } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { groups, reviewPointTags, chartTags } from "../schema/curation.js";
import { rowToGroup } from "../mappers/group.js";

/** Drizzle 구현 — 사전(bigserial id, 이름 unique) + 부착 정션(타점 삼중키 × tag_id). */
export class DrizzleGroupRepository implements GroupReader, GroupStore {
    constructor(private readonly db: Database) {}

    async listGroups(): Promise<Group[]> {
        const rows = await this.db.select().from(groups).orderBy(asc(groups.name));
        return rows.map(rowToGroup);
    }

    // 전 타점의 부착을 한 번에 — 타점키로 접는다. 그룹이 붙은 타점만 항목을 갖는다(빈 항목 없음).
    // 정렬은 (타점키, group 이름) — groupIds 순서가 클라 표시 순서가 되므로 사전 순서(listGroups)와 같은 기준으로 맞춘다.
    async listAllAttachments(): Promise<GroupAttachment[]> {
        const rows = await this.db
            .select({
                stockCode: reviewPointTags.stockCode,
                date: reviewPointTags.tradeDate,
                time: reviewPointTags.tradeTime,
                groupId: reviewPointTags.groupId,
            })
            .from(reviewPointTags)
            .innerJoin(groups, eq(reviewPointTags.groupId, groups.id))
            .orderBy(
                asc(reviewPointTags.stockCode),
                asc(reviewPointTags.tradeDate),
                asc(reviewPointTags.tradeTime),
                asc(groups.name),
            );

        const byPoint = new Map<string, GroupAttachment>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}|${r.time}`;
            let att = byPoint.get(key);
            if (!att) byPoint.set(key, (att = { stockCode: r.stockCode, date: r.date, time: r.time, groupIds: [] }));
            att.groupIds.push(String(r.groupId));
        }
        return [...byPoint.values()];
    }

    // 전 차트의 소유 부착 — 타점판과 같은 접기(차트키), 같은 정렬 기준(group 이름순).
    async listAllChartAttachments(): Promise<ChartGroupAttachment[]> {
        const rows = await this.db
            .select({ stockCode: chartTags.stockCode, date: chartTags.tradeDate, groupId: chartTags.groupId })
            .from(chartTags)
            .innerJoin(groups, eq(chartTags.groupId, groups.id))
            .orderBy(asc(chartTags.stockCode), asc(chartTags.tradeDate), asc(groups.name));

        const byChart = new Map<string, ChartGroupAttachment>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}`;
            let att = byChart.get(key);
            if (!att) byChart.set(key, (att = { stockCode: r.stockCode, date: r.date, groupIds: [] }));
            att.groupIds.push(String(r.groupId));
        }
        return [...byChart.values()];
    }

    async createGroup(name: string): Promise<Group> {
        // 같은 이름이면 기존 행을 그대로 반환 — DO NOTHING 은 returning 이 비어 실패하므로, 이름을 제자리에
        // 다시 써 넣는 DO UPDATE 로 항상 행을 돌려받는다(중복 생성 시도 = 그 그룹 선택과 같은 뜻).
        const [row] = await this.db
            .insert(groups)
            .values({ name })
            .onConflictDoUpdate({ target: groups.name, set: { name: sql`EXCLUDED.name` } })
            .returning();
        return rowToGroup(row);
    }

    async renameGroup(id: string, name: string): Promise<void> {
        // 없는 id 는 0행 갱신 = 조용한 no-op(rank 축 rename 선례).
        await this.db.update(groups).set({ name }).where(eq(groups.id, BigInt(id)));
    }

    async removeGroup(id: string): Promise<void> {
        // FK cascade: review_point_tags 의 부착도 함께 삭제.
        await this.db.delete(groups).where(eq(groups.id, BigInt(id)));
    }

    async attach(groupId: string, point: ReviewPointKey): Promise<void> {
        await this.db
            .insert(reviewPointTags)
            .values({ stockCode: point.stockCode, tradeDate: point.date, tradeTime: point.time, groupId: BigInt(groupId) })
            .onConflictDoNothing(); // PK 충돌 = 이미 붙음(멱등)
    }

    async detach(groupId: string, point: ReviewPointKey): Promise<void> {
        await this.db
            .delete(reviewPointTags)
            .where(
                and(
                    eq(reviewPointTags.stockCode, point.stockCode),
                    eq(reviewPointTags.tradeDate, point.date),
                    eq(reviewPointTags.tradeTime, point.time),
                    eq(reviewPointTags.groupId, BigInt(groupId)),
                ),
            );
    }

    async attachToChart(groupId: string, chart: ChartRef): Promise<void> {
        await this.db
            .insert(chartTags)
            .values({ stockCode: chart.stockCode, tradeDate: chart.date, groupId: BigInt(groupId) })
            .onConflictDoNothing(); // PK 충돌 = 이미 붙음(멱등)
    }

    async detachFromChart(groupId: string, chart: ChartRef): Promise<void> {
        await this.db
            .delete(chartTags)
            .where(and(eq(chartTags.stockCode, chart.stockCode), eq(chartTags.tradeDate, chart.date), eq(chartTags.groupId, BigInt(groupId))));
    }
}
