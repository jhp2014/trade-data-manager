import { and, asc, eq } from "drizzle-orm";
import type {
    Hypothesis,
    HypothesisLink,
    HypothesisRelation,
    HypothesisReader,
    HypothesisStore,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { hypotheses, hypothesisPoints, hypothesisRelations } from "../schema/curation.js";
import { rowToHypothesis, rowToHypothesisLink, rowToHypothesisRelation } from "../mappers/hypothesis.js";

/** Drizzle 구현 — 가설(bigserial id) + 타점 연결(자연키 정션) + 관계 그래프. */
export class DrizzleHypothesisRepository implements HypothesisReader, HypothesisStore {
    constructor(private readonly db: Database) {}

    async listHypotheses(): Promise<Hypothesis[]> {
        const rows = await this.db.select().from(hypotheses).orderBy(asc(hypotheses.id));
        return rows.map(rowToHypothesis);
    }

    async listLinks(): Promise<HypothesisLink[]> {
        const rows = await this.db.select().from(hypothesisPoints);
        return rows.map(rowToHypothesisLink);
    }

    async listRelations(): Promise<HypothesisRelation[]> {
        const rows = await this.db.select().from(hypothesisRelations).orderBy(asc(hypothesisRelations.id));
        return rows.map(rowToHypothesisRelation);
    }

    async create(text: string): Promise<Hypothesis> {
        const [row] = await this.db.insert(hypotheses).values({ text }).returning();
        return rowToHypothesis(row);
    }

    async update(id: string, text: string): Promise<void> {
        // 없는 id 는 0행 갱신 = 조용한 no-op(remove·unlink 와 대칭).
        await this.db.update(hypotheses).set({ text }).where(eq(hypotheses.id, BigInt(id)));
    }

    async link(l: HypothesisLink): Promise<void> {
        // 정션 composite PK 충돌 = 이미 연결됨 → 무시(멱등).
        await this.db
            .insert(hypothesisPoints)
            .values({ hypothesisId: BigInt(l.hypothesisId), stockCode: l.stockCode, tradeDate: l.date, tradeTime: l.time })
            .onConflictDoNothing();
    }

    async unlink(l: HypothesisLink): Promise<void> {
        await this.db
            .delete(hypothesisPoints)
            .where(
                and(
                    eq(hypothesisPoints.hypothesisId, BigInt(l.hypothesisId)),
                    eq(hypothesisPoints.stockCode, l.stockCode),
                    eq(hypothesisPoints.tradeDate, l.date),
                    eq(hypothesisPoints.tradeTime, l.time),
                ),
            );
    }

    async remove(id: string): Promise<void> {
        // FK onDelete cascade: hypothesis_points·hypothesis_relations 도 함께 삭제.
        await this.db.delete(hypotheses).where(eq(hypotheses.id, BigInt(id)));
    }

    async addRelation(r: { fromId: string; toId: string; relationType: string; note?: string }): Promise<HypothesisRelation> {
        const rows = await this.db
            .insert(hypothesisRelations)
            .values({ fromId: BigInt(r.fromId), toId: BigInt(r.toId), relationType: r.relationType, note: r.note ?? null })
            .onConflictDoNothing() // (from, type, to) 중복이면 무시 → 아래서 기존 조회.
            .returning();
        if (rows.length > 0) return rowToHypothesisRelation(rows[0]);
        const [existing] = await this.db
            .select()
            .from(hypothesisRelations)
            .where(
                and(
                    eq(hypothesisRelations.fromId, BigInt(r.fromId)),
                    eq(hypothesisRelations.relationType, r.relationType),
                    eq(hypothesisRelations.toId, BigInt(r.toId)),
                ),
            );
        return rowToHypothesisRelation(existing);
    }

    async removeRelation(id: string): Promise<void> {
        await this.db.delete(hypothesisRelations).where(eq(hypothesisRelations.id, BigInt(id)));
    }
}
