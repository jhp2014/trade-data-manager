import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
    cases,
    hypotheses,
    hypothesisCases,
    hypothesisRelations,
    hypothesisTags,
    tags,
} from "@/db/schema";
import { formatHypothesisCode } from "@/domain/hypothesisCode";
import { computeWarnings } from "@/domain/validation";
import type {
    Case,
    Hypothesis,
    HypothesisCase,
    HypothesisRelation,
    HypothesisSnapshot,
    HypothesisTag,
    Tag,
} from "@/domain/types";
import type { CaseInput, HypothesisRepository } from "./HypothesisRepository";

/**
 * 'hypothesis' Postgres schema 위의 HypothesisRepository 구현.
 * loadSnapshot 은 computeWarnings 로 relation 경고를 주입한다.
 */
export class DbHypothesisRepository implements HypothesisRepository {
    constructor(private readonly db: Database) {}

    async loadSnapshot(): Promise<HypothesisSnapshot> {
        const [caseRows, hypRows, tagRows, htRows, hcRows, hrRows] = await Promise.all([
            this.db.select().from(cases).orderBy(asc(cases.caseId)),
            this.db.select().from(hypotheses).orderBy(asc(hypotheses.id)),
            this.db.select().from(tags).orderBy(asc(tags.id)),
            this.db.select().from(hypothesisTags),
            this.db.select().from(hypothesisCases).orderBy(asc(hypothesisCases.id)),
            this.db.select().from(hypothesisRelations).orderBy(asc(hypothesisRelations.id)),
        ]);

        const relations = hrRows.map(toHypothesisRelation);
        return {
            cases: caseRows.map(toCase),
            hypotheses: hypRows.map(toHypothesis),
            tags: tagRows.map(toTag),
            hypothesisTags: htRows.map(toHypothesisTag),
            hypothesisCases: hcRows.map(toHypothesisCase),
            hypothesisRelations: relations,
            warnings: computeWarnings({ hypothesisRelations: relations }),
        };
    }

    // --- hypotheses ---

    async createHypothesis(input: {
        text: string;
        status?: string;
        extra?: Record<string, string>;
    }): Promise<{ id: string; code: string }> {
        const [row] = await this.db
            .insert(hypotheses)
            .values({
                text: input.text,
                status: input.status ?? "draft",
                extra: input.extra ?? {},
            })
            .returning({ id: hypotheses.id });
        return { id: String(row.id), code: formatHypothesisCode(row.id) };
    }

    async updateHypothesis(input: {
        id: string;
        text?: string;
        status?: string;
    }): Promise<void> {
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (input.text !== undefined) set.text = input.text;
        if (input.status !== undefined) set.status = input.status;
        await this.db.update(hypotheses).set(set).where(eq(hypotheses.id, BigInt(input.id)));
    }

    async deleteHypothesis(id: string): Promise<void> {
        await this.db.delete(hypotheses).where(eq(hypotheses.id, BigInt(id)));
    }

    // --- cases (snapshot) ---

    async ensureCase(input: CaseInput): Promise<void> {
        await this.db
            .insert(cases)
            .values({
                caseId: input.caseId,
                stockCode: input.stockCode,
                stockName: input.stockName ?? null,
                tradeDate: input.tradeDate,
                tradeTime: input.tradeTime ?? null,
                extra: input.extra ?? {},
            })
            .onConflictDoNothing({ target: cases.caseId });
    }

    async refreshCaseStockName(input: {
        caseId: string;
        stockName: string | null;
    }): Promise<void> {
        await this.db
            .update(cases)
            .set({ stockName: input.stockName, updatedAt: new Date() })
            .where(eq(cases.caseId, input.caseId));
    }

    async removeCase(caseId: string): Promise<void> {
        await this.db.delete(cases).where(eq(cases.caseId, caseId));
    }

    // --- hypothesis <-> case ---

    async upsertCaseLink(input: {
        hypothesisId: string;
        caseId: string;
        outcome?: string | null;
        note?: string | null;
    }): Promise<void> {
        await this.db
            .insert(hypothesisCases)
            .values({
                hypothesisId: BigInt(input.hypothesisId),
                caseId: input.caseId,
                outcome: input.outcome ?? null,
                note: input.note ?? null,
            })
            .onConflictDoUpdate({
                target: [hypothesisCases.hypothesisId, hypothesisCases.caseId],
                set: {
                    outcome: input.outcome ?? null,
                    note: input.note ?? null,
                    updatedAt: new Date(),
                },
            });
    }

    async removeCaseLink(input: {
        hypothesisId: string;
        caseId: string;
    }): Promise<void> {
        await this.db
            .delete(hypothesisCases)
            .where(
                and(
                    eq(hypothesisCases.hypothesisId, BigInt(input.hypothesisId)),
                    eq(hypothesisCases.caseId, input.caseId),
                ),
            );
    }

    // --- tags ---

    async addTag(input: { hypothesisId: string; tagName: string }): Promise<void> {
        const tagId = await this.ensureTag(input.tagName);
        await this.db
            .insert(hypothesisTags)
            .values({ hypothesisId: BigInt(input.hypothesisId), tagId })
            .onConflictDoNothing();
    }

    async removeTag(input: { hypothesisId: string; tagId: string }): Promise<void> {
        await this.db
            .delete(hypothesisTags)
            .where(
                and(
                    eq(hypothesisTags.hypothesisId, BigInt(input.hypothesisId)),
                    eq(hypothesisTags.tagId, BigInt(input.tagId)),
                ),
            );
    }

    private async ensureTag(name: string): Promise<bigint> {
        const existing = await this.db
            .select({ id: tags.id })
            .from(tags)
            .where(eq(tags.name, name))
            .limit(1);
        if (existing[0]) return existing[0].id;

        const [row] = await this.db
            .insert(tags)
            .values({ name })
            .onConflictDoNothing()
            .returning({ id: tags.id });
        if (row) return row.id;

        // 동시성으로 사이에 생성된 경우 재조회.
        const again = await this.db
            .select({ id: tags.id })
            .from(tags)
            .where(eq(tags.name, name))
            .limit(1);
        return again[0].id;
    }

    // --- relations ---

    async upsertRelation(input: {
        fromHypothesisId: string;
        toHypothesisId: string;
        relationType: string;
        note?: string | null;
    }): Promise<void> {
        await this.db
            .insert(hypothesisRelations)
            .values({
                fromHypothesisId: BigInt(input.fromHypothesisId),
                toHypothesisId: BigInt(input.toHypothesisId),
                relationType: input.relationType,
                note: input.note ?? null,
            })
            .onConflictDoUpdate({
                target: [
                    hypothesisRelations.fromHypothesisId,
                    hypothesisRelations.relationType,
                    hypothesisRelations.toHypothesisId,
                ],
                set: { note: input.note ?? null },
            });
    }

    async removeRelation(input: {
        fromHypothesisId: string;
        toHypothesisId: string;
        relationType: string;
    }): Promise<void> {
        await this.db
            .delete(hypothesisRelations)
            .where(
                and(
                    eq(hypothesisRelations.fromHypothesisId, BigInt(input.fromHypothesisId)),
                    eq(hypothesisRelations.relationType, input.relationType),
                    eq(hypothesisRelations.toHypothesisId, BigInt(input.toHypothesisId)),
                ),
            );
    }
}

// --- row → domain 매핑 ---

type CaseRow = typeof cases.$inferSelect;
type HypothesisRow = typeof hypotheses.$inferSelect;
type TagRow = typeof tags.$inferSelect;
type HypothesisTagRow = typeof hypothesisTags.$inferSelect;
type HypothesisCaseRow = typeof hypothesisCases.$inferSelect;
type HypothesisRelationRow = typeof hypothesisRelations.$inferSelect;

function toCase(r: CaseRow): Case {
    return {
        caseId: r.caseId,
        stockCode: r.stockCode,
        stockName: r.stockName,
        tradeDate: r.tradeDate,
        tradeTime: r.tradeTime ? r.tradeTime.slice(0, 5) : null,
        extra: r.extra,
    };
}

function toHypothesis(r: HypothesisRow): Hypothesis {
    return {
        id: String(r.id),
        code: formatHypothesisCode(r.id),
        text: r.text,
        status: r.status,
        extra: r.extra,
    };
}

function toTag(r: TagRow): Tag {
    return { id: String(r.id), name: r.name };
}

function toHypothesisTag(r: HypothesisTagRow): HypothesisTag {
    return { hypothesisId: String(r.hypothesisId), tagId: String(r.tagId) };
}

function toHypothesisCase(r: HypothesisCaseRow): HypothesisCase {
    return {
        id: String(r.id),
        hypothesisId: String(r.hypothesisId),
        caseId: r.caseId,
        outcome: r.outcome,
        note: r.note,
        extra: r.extra,
    };
}

function toHypothesisRelation(r: HypothesisRelationRow): HypothesisRelation {
    return {
        id: String(r.id),
        fromHypothesisId: String(r.fromHypothesisId),
        toHypothesisId: String(r.toHypothesisId),
        relationType: r.relationType,
        note: r.note,
    };
}
