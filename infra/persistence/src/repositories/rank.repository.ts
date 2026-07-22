import { and, asc, eq } from "drizzle-orm";
import type { RankAxis, PlacedPoint, RankPoint, RankTarget, RankReader, RankStore } from "@trade-data-manager/market";
import type { Database, DbClient } from "../db.js";
import { rankAxes, rankSlots, rankPlacements } from "../schema/curation.js";
import { rowToRankAxis } from "../mappers/rank.js";

/** Drizzle 구현 — 축(bigserial id) + slot(order_key) + 배치(자연키 정션). 배치/이동/제거는 트랜잭션. */
export class DrizzleRankRepository implements RankReader, RankStore {
    constructor(private readonly db: Database) {}

    async listAxes(): Promise<RankAxis[]> {
        const rows = await this.db.select().from(rankAxes).orderBy(asc(rankAxes.id));
        return rows.map(rowToRankAxis);
    }

    async listAxisLine(axisId: string): Promise<PlacedPoint[]> {
        const rows = await this.db
            .select({
                slotId: rankSlots.id,
                orderKey: rankSlots.orderKey,
                stockCode: rankPlacements.stockCode,
                date: rankPlacements.tradeDate,
                time: rankPlacements.tradeTime,
            })
            .from(rankPlacements)
            .innerJoin(rankSlots, eq(rankPlacements.slotId, rankSlots.id))
            .where(eq(rankPlacements.axisId, BigInt(axisId)))
            .orderBy(asc(rankSlots.orderKey));
        return rows.map((r) => ({
            slotId: String(r.slotId),
            orderKey: r.orderKey,
            stockCode: r.stockCode,
            date: r.date,
            time: r.time,
        }));
    }

    async createAxis(name: string): Promise<RankAxis> {
        const [row] = await this.db.insert(rankAxes).values({ name }).returning();
        return rowToRankAxis(row);
    }

    async renameAxis(id: string, name: string): Promise<void> {
        // 없는 id 는 0행 갱신 = 조용한 no-op.
        await this.db.update(rankAxes).set({ name }).where(eq(rankAxes.id, BigInt(id)));
    }

    async removeAxis(id: string): Promise<void> {
        // FK cascade: rank_slots → rank_placements 함께 삭제.
        await this.db.delete(rankAxes).where(eq(rankAxes.id, BigInt(id)));
    }

    async place(axisId: string, point: RankPoint, target: RankTarget): Promise<{ slotId: string; orderKey: number }> {
        const axis = BigInt(axisId);
        return this.db.transaction(async (tx) => {
            // 1. 대상 slot 결정 — 기존 합류(타이) 또는 두 이웃 사이 새 slot(중간키).
            let slotId: bigint;
            let orderKey: number;
            if (target.kind === "slot") {
                const [s] = await tx
                    .select({ orderKey: rankSlots.orderKey, axisId: rankSlots.axisId })
                    .from(rankSlots)
                    .where(eq(rankSlots.id, BigInt(target.slotId)));
                if (!s || s.axisId !== axis) throw new Error("slot 이 이 축에 속하지 않음");
                slotId = BigInt(target.slotId);
                orderKey = s.orderKey;
            } else {
                orderKey = await resolveBetweenKey(tx, axis, target.prevSlotId, target.nextSlotId);
                const [created] = await tx.insert(rankSlots).values({ axisId: axis, orderKey }).returning({ id: rankSlots.id });
                slotId = created.id;
            }

            // 2. 옛 slot 파악(이동 시 GC 대상).
            const oldSlotId = await currentSlotOf(tx, axis, point);

            // 3. 배치 upsert — PK(code,date,time,axis) 충돌 = 이동 → slotId 만 교체.
            await tx
                .insert(rankPlacements)
                .values({ stockCode: point.stockCode, tradeDate: point.date, tradeTime: point.time, axisId: axis, slotId })
                .onConflictDoUpdate({
                    target: [rankPlacements.stockCode, rankPlacements.tradeDate, rankPlacements.tradeTime, rankPlacements.axisId],
                    set: { slotId },
                });

            // 4. 이동으로 비워진 옛 slot GC.
            if (oldSlotId != null && oldSlotId !== slotId) await gcSlotIfEmpty(tx, oldSlotId);

            return { slotId: String(slotId), orderKey };
        });
    }

    async unplace(axisId: string, point: RankPoint): Promise<void> {
        const axis = BigInt(axisId);
        await this.db.transaction(async (tx) => {
            const oldSlotId = await currentSlotOf(tx, axis, point);
            await tx
                .delete(rankPlacements)
                .where(
                    and(
                        eq(rankPlacements.stockCode, point.stockCode),
                        eq(rankPlacements.tradeDate, point.date),
                        eq(rankPlacements.tradeTime, point.time),
                        eq(rankPlacements.axisId, axis),
                    ),
                );
            if (oldSlotId != null) await gcSlotIfEmpty(tx, oldSlotId);
        });
    }
}

/** 타점이 이 축에서 현재 꽂힌 slot(없으면 null). */
async function currentSlotOf(tx: DbClient, axis: bigint, point: RankPoint): Promise<bigint | null> {
    const [row] = await tx
        .select({ slotId: rankPlacements.slotId })
        .from(rankPlacements)
        .where(
            and(
                eq(rankPlacements.stockCode, point.stockCode),
                eq(rankPlacements.tradeDate, point.date),
                eq(rankPlacements.tradeTime, point.time),
                eq(rankPlacements.axisId, axis),
            ),
        );
    return row?.slotId ?? null;
}

/**
 * between 배치용 order_key. 양쪽 이웃 사이 double 간격이 소진돼 사이 값을 못 만들면
 * 축을 정수 간격으로 reindex 한 뒤 재계산(반드시 성공). 소진은 같은 틈에 ~50회 이상 반복 삽입 시에만.
 */
async function resolveBetweenKey(tx: DbClient, axis: bigint, prevSlotId?: string, nextSlotId?: string): Promise<number> {
    const first = await midpointKey(tx, axis, prevSlotId, nextSlotId);
    if (first != null) return first;
    await reindexAxis(tx, axis);
    const retry = await midpointKey(tx, axis, prevSlotId, nextSlotId);
    if (retry == null) throw new Error("reindex 후에도 중간키 실패 — 인접하지 않은 경계 slot 의심");
    return retry;
}

/**
 * 두 이웃 slot 사이 새 order_key. 끝단(prev/next null)은 ±1, 빈 축은 0.
 * 양쪽 이웃이 있는데 부동소수 간격이 소진돼 엄격히 사이인 값이 없으면 null(→ 호출부가 reindex).
 */
async function midpointKey(tx: DbClient, axis: bigint, prevSlotId?: string, nextSlotId?: string): Promise<number | null> {
    const prev = prevSlotId != null ? await keyOf(tx, axis, prevSlotId) : null;
    const next = nextSlotId != null ? await keyOf(tx, axis, nextSlotId) : null;
    if (prev != null && next != null) {
        const m = (prev + next) / 2;
        return m > prev && m < next ? m : null; // 간격 소진이면 null
    }
    if (prev != null) return prev + 1;
    if (next != null) return next - 1;
    return 0;
}

/**
 * 한 축의 slot 을 현재 순서대로 0,1,2,…N-1 로 재부여. 정수 간격이라 사이 세분 여지가 복원된다.
 * order_key 에 유일 제약이 없어 갱신 중 일시적 중복도 안전. slot·placement 는 그대로(키만 바뀜) → 순서 보존.
 */
async function reindexAxis(tx: DbClient, axis: bigint): Promise<void> {
    const slots = await tx
        .select({ id: rankSlots.id })
        .from(rankSlots)
        .where(eq(rankSlots.axisId, axis))
        .orderBy(asc(rankSlots.orderKey), asc(rankSlots.id));
    for (let i = 0; i < slots.length; i++) {
        await tx.update(rankSlots).set({ orderKey: i }).where(eq(rankSlots.id, slots[i].id));
    }
}

/** slot 의 order_key(축 소속 검증). */
async function keyOf(tx: DbClient, axis: bigint, slotId: string): Promise<number> {
    const [s] = await tx
        .select({ orderKey: rankSlots.orderKey, axisId: rankSlots.axisId })
        .from(rankSlots)
        .where(eq(rankSlots.id, BigInt(slotId)));
    if (!s || s.axisId !== axis) throw new Error("경계 slot 이 이 축에 속하지 않음");
    return s.orderKey;
}

/** slot 이 비었으면 삭제(유령 slot 방지). */
async function gcSlotIfEmpty(tx: DbClient, slotId: bigint): Promise<void> {
    const rows = await tx.select({ slotId: rankPlacements.slotId }).from(rankPlacements).where(eq(rankPlacements.slotId, slotId)).limit(1);
    if (rows.length === 0) await tx.delete(rankSlots).where(eq(rankSlots.id, slotId));
}
