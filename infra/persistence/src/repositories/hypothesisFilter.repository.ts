import { asc, eq } from "drizzle-orm";
import type {
    HypothesisFilter,
    HypothesisFilterExpr,
    HypothesisFilterReader,
    HypothesisFilterStore,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { hypothesisFilters } from "../schema/curation.js";
import { rowToHypothesisFilter } from "../mappers/hypothesisFilter.js";

/** Drizzle 구현 — 저장 가설 필터(bigserial id, name unique). save = 이름 upsert. */
export class DrizzleHypothesisFilterRepository implements HypothesisFilterReader, HypothesisFilterStore {
    constructor(private readonly db: Database) {}

    async listFilters(): Promise<HypothesisFilter[]> {
        const rows = await this.db.select().from(hypothesisFilters).orderBy(asc(hypothesisFilters.name));
        return rows.map(rowToHypothesisFilter);
    }

    async save(name: string, expr: HypothesisFilterExpr): Promise<HypothesisFilter> {
        // 같은 이름이면 식만 갱신(파일 저장 관례). createdAt 은 최초 유지.
        const [row] = await this.db
            .insert(hypothesisFilters)
            .values({ name, expr })
            .onConflictDoUpdate({ target: hypothesisFilters.name, set: { expr } })
            .returning();
        return rowToHypothesisFilter(row);
    }

    async remove(id: string): Promise<void> {
        await this.db.delete(hypothesisFilters).where(eq(hypothesisFilters.id, BigInt(id)));
    }
}
