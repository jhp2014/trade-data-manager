import { and, asc, eq, sql } from "drizzle-orm";
import type { Tag, TagAttachment, ChartTagAttachment, ChartRef, ReviewPointKey, TagReader, TagStore } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { tags, reviewPointTags, chartTags } from "../schema/curation.js";
import { rowToTag } from "../mappers/tag.js";

/** Drizzle 구현 — 사전(bigserial id, 이름 unique) + 부착 정션(타점 삼중키 × tag_id). */
export class DrizzleTagRepository implements TagReader, TagStore {
    constructor(private readonly db: Database) {}

    async listTags(): Promise<Tag[]> {
        const rows = await this.db.select().from(tags).orderBy(asc(tags.name));
        return rows.map(rowToTag);
    }

    // 전 타점의 부착을 한 번에 — 타점키로 접는다. 태그가 붙은 타점만 항목을 갖는다(빈 항목 없음).
    // 정렬은 (타점키, tag 이름) — tagIds 순서가 클라 표시 순서가 되므로 사전 순서(listTags)와 같은 기준으로 맞춘다.
    async listAllAttachments(): Promise<TagAttachment[]> {
        const rows = await this.db
            .select({
                stockCode: reviewPointTags.stockCode,
                date: reviewPointTags.tradeDate,
                time: reviewPointTags.tradeTime,
                tagId: reviewPointTags.tagId,
            })
            .from(reviewPointTags)
            .innerJoin(tags, eq(reviewPointTags.tagId, tags.id))
            .orderBy(
                asc(reviewPointTags.stockCode),
                asc(reviewPointTags.tradeDate),
                asc(reviewPointTags.tradeTime),
                asc(tags.name),
            );

        const byPoint = new Map<string, TagAttachment>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}|${r.time}`;
            let att = byPoint.get(key);
            if (!att) byPoint.set(key, (att = { stockCode: r.stockCode, date: r.date, time: r.time, tagIds: [] }));
            att.tagIds.push(String(r.tagId));
        }
        return [...byPoint.values()];
    }

    // 전 차트의 소유 부착 — 타점판과 같은 접기(차트키), 같은 정렬 기준(tag 이름순).
    async listAllChartAttachments(): Promise<ChartTagAttachment[]> {
        const rows = await this.db
            .select({ stockCode: chartTags.stockCode, date: chartTags.tradeDate, tagId: chartTags.tagId })
            .from(chartTags)
            .innerJoin(tags, eq(chartTags.tagId, tags.id))
            .orderBy(asc(chartTags.stockCode), asc(chartTags.tradeDate), asc(tags.name));

        const byChart = new Map<string, ChartTagAttachment>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}`;
            let att = byChart.get(key);
            if (!att) byChart.set(key, (att = { stockCode: r.stockCode, date: r.date, tagIds: [] }));
            att.tagIds.push(String(r.tagId));
        }
        return [...byChart.values()];
    }

    async createTag(name: string): Promise<Tag> {
        // 같은 이름이면 기존 행을 그대로 반환 — DO NOTHING 은 returning 이 비어 실패하므로, 이름을 제자리에
        // 다시 써 넣는 DO UPDATE 로 항상 행을 돌려받는다(중복 생성 시도 = 그 태그 선택과 같은 뜻).
        const [row] = await this.db
            .insert(tags)
            .values({ name })
            .onConflictDoUpdate({ target: tags.name, set: { name: sql`EXCLUDED.name` } })
            .returning();
        return rowToTag(row);
    }

    async renameTag(id: string, name: string): Promise<void> {
        // 없는 id 는 0행 갱신 = 조용한 no-op(rank 축 rename 선례).
        await this.db.update(tags).set({ name }).where(eq(tags.id, BigInt(id)));
    }

    async removeTag(id: string): Promise<void> {
        // FK cascade: review_point_tags 의 부착도 함께 삭제.
        await this.db.delete(tags).where(eq(tags.id, BigInt(id)));
    }

    async attach(tagId: string, point: ReviewPointKey): Promise<void> {
        await this.db
            .insert(reviewPointTags)
            .values({ stockCode: point.stockCode, tradeDate: point.date, tradeTime: point.time, tagId: BigInt(tagId) })
            .onConflictDoNothing(); // PK 충돌 = 이미 붙음(멱등)
    }

    async detach(tagId: string, point: ReviewPointKey): Promise<void> {
        await this.db
            .delete(reviewPointTags)
            .where(
                and(
                    eq(reviewPointTags.stockCode, point.stockCode),
                    eq(reviewPointTags.tradeDate, point.date),
                    eq(reviewPointTags.tradeTime, point.time),
                    eq(reviewPointTags.tagId, BigInt(tagId)),
                ),
            );
    }

    async attachToChart(tagId: string, chart: ChartRef): Promise<void> {
        await this.db
            .insert(chartTags)
            .values({ stockCode: chart.stockCode, tradeDate: chart.date, tagId: BigInt(tagId) })
            .onConflictDoNothing(); // PK 충돌 = 이미 붙음(멱등)
    }

    async detachFromChart(tagId: string, chart: ChartRef): Promise<void> {
        await this.db
            .delete(chartTags)
            .where(and(eq(chartTags.stockCode, chart.stockCode), eq(chartTags.tradeDate, chart.date), eq(chartTags.tagId, BigInt(tagId))));
    }
}
