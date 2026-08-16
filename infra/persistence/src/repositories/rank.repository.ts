import { and, asc, eq } from "drizzle-orm";
import type { RankAxis, RankAxisScope, AxisLine, PlacedPoint, RankPoint, RankTarget, RankReader, RankStore } from "@trade-data-manager/market";
import type { Database, DbClient } from "../db.js";
import { rankAxes, rankSlots, rankPlacements, reviewPoints } from "../schema/curation.js";
import { rowToRankAxis } from "../mappers/rank.js";

/** Drizzle 구현 — 축(bigserial id) + slot(order_key) + 배치(자연키 정션). 배치/이동/제거는 트랜잭션. */
export class DrizzleRankRepository implements RankReader, RankStore {
    constructor(private readonly db: Database) {}

    async listAxes(): Promise<RankAxis[]> {
        const rows = await this.db.select().from(rankAxes).orderBy(asc(rankAxes.id));
        return rows.map(rowToRankAxis);
    }

    // 전 축을 한 번에 — 축별 왕복(N+1) 대신 한 쿼리로 긁어 축 이름으로 접는다. 배치가 있는 축만 키를 갖는다
    // (빈 축은 행이 없음 → 소비자는 축 목록 기준으로 없으면 빈 줄로 취급).
    // slotId 를 안 싣는다: uq_rank_slot_position 덕에 **orderKey 가 같으면 같은 자리**라 중복 필드였고,
    // slot 은 계약에 실을 이름이 없다.
    async listAllLines(): Promise<AxisLine[]> {
        const rows = await this.db
            .select({
                axisName: rankAxes.name,
                orderKey: rankSlots.orderKey,
                stockCode: rankPlacements.stockCode,
                date: rankPlacements.tradeDate,
                time: rankPlacements.tradeTime,
            })
            .from(rankPlacements)
            .innerJoin(rankSlots, eq(rankPlacements.slotId, rankSlots.id))
            .innerJoin(rankAxes, eq(rankPlacements.axisId, rankAxes.id))
            .orderBy(asc(rankAxes.name), asc(rankSlots.orderKey));

        const byAxis = new Map<string, PlacedPoint[]>();
        for (const r of rows) {
            let line = byAxis.get(r.axisName);
            if (!line) byAxis.set(r.axisName, (line = []));
            line.push({ orderKey: r.orderKey, stockCode: r.stockCode, date: r.date, time: r.time });
        }
        return [...byAxis].map(([axisName, placements]) => ({ axisName, placements }));
    }

    async createAxis(name: string, scope: RankAxisScope = "point"): Promise<RankAxis> {
        const [row] = await this.db.insert(rankAxes).values({ name, scope }).returning();
        return rowToRankAxis(row);
    }

    async renameAxis(name: string, newName: string): Promise<void> {
        // 없는 이름은 0행 갱신 = 조용한 no-op.
        await this.db.update(rankAxes).set({ name: newName }).where(eq(rankAxes.name, name));
    }

    async removeAxis(name: string): Promise<void> {
        // FK cascade: rank_slots → rank_placements 함께 삭제.
        await this.db.delete(rankAxes).where(eq(rankAxes.name, name));
    }

    async place(axisName: string, point: RankPoint, target: RankTarget): Promise<{ orderKey: number }> {
        return this.db.transaction(async (tx) => {
            const axis = await axisIdOf(tx, axisName);
            // 계약은 자리를 **타점으로** 지목한다 — 여기서 한 번만 실제 slot 으로 푼다.
            const anchor = target.kind === "slot" ? await slotOfPlaced(tx, axis, target.point) : null;
            const prev = target.kind === "between" ? await slotOfPlacedOpt(tx, axis, target.after) : null;
            const next = target.kind === "between" ? await slotOfPlacedOpt(tx, axis, target.before) : null;
            // 방어 — between 인데 두 경계가 같은 slot(타이 그룹 내부에 놓음)이면 사이 중간키가 불가능(order_key 동일).
            //   의미상 같은 순위 = 그 slot 에 합류(타이). 클라가 이미 걸러도, 어떤 경로든 500 안 나게 여기서 정규화.
            const joinSlot = anchor ?? (prev != null && prev === next ? prev : null);

            // day 축은 그날 전 타점(미배치 포함)을 대상, point 축은 그 타점 하나. 그날 타점 0개면 붙일 데 없음.
            const targets = await fanoutTargets(tx, axis, point);
            if (targets.length === 0) throw new Error("그날 타점이 없어 배치할 수 없음");

            // 1. 대상 slot 결정 — 기존 합류(타이) 또는 두 이웃 사이 새 slot(중간키).
            let slotId: bigint;
            let orderKey: number;
            if (joinSlot != null) {
                slotId = joinSlot;
                orderKey = await keyOf(tx, axis, joinSlot);
            } else {
                orderKey = await resolveBetweenKey(tx, axis, prev, next);
                const [created] = await tx.insert(rankSlots).values({ axisId: axis, orderKey }).returning({ id: rankSlots.id });
                slotId = created.id;
            }

            // 2. 대상 타점 전원 upsert — PK(code,date,time,axis) 충돌 = 이동 → slotId 만 교체. 비워진 옛 slot 수집.
            const vacated = new Set<bigint>();
            for (const p of targets) {
                const old = await currentSlotOf(tx, axis, p);
                if (old != null) vacated.add(old);
                await tx
                    .insert(rankPlacements)
                    .values({ stockCode: p.stockCode, tradeDate: p.date, tradeTime: p.time, axisId: axis, slotId })
                    .onConflictDoUpdate({
                        target: [rankPlacements.stockCode, rankPlacements.tradeDate, rankPlacements.tradeTime, rankPlacements.axisId],
                        set: { slotId },
                    });
            }

            // 3. 이동으로 비워진 옛 slot GC(새 slot 제외).
            for (const old of vacated) if (old !== slotId) await gcSlotIfEmpty(tx, old);

            return { orderKey };
        });
    }

    async unplace(axisName: string, point: RankPoint): Promise<void> {
        await this.db.transaction(async (tx) => {
            const axis = await axisIdOf(tx, axisName);
            const targets = await fanoutTargets(tx, axis, point); // day 축 = 그날 전 타점
            const vacated = new Set<bigint>();
            for (const p of targets) {
                const old = await currentSlotOf(tx, axis, p);
                if (old != null) vacated.add(old);
                await tx
                    .delete(rankPlacements)
                    .where(
                        and(
                            eq(rankPlacements.stockCode, p.stockCode),
                            eq(rankPlacements.tradeDate, p.date),
                            eq(rankPlacements.tradeTime, p.time),
                            eq(rankPlacements.axisId, axis),
                        ),
                    );
            }
            for (const old of vacated) await gcSlotIfEmpty(tx, old);
        });
    }
}

/**
 * 배치가 실제로 적용될 타점 집합. point 축 = 넘어온 타점 하나 그대로.
 * day 축 = 그 (종목·날짜)의 review_points 전부(아직 이 축에 안 꽂힌 타점도 끌어와 함께 정렬 = fanout).
 */
async function fanoutTargets(tx: DbClient, axis: bigint, point: RankPoint): Promise<RankPoint[]> {
    const [a] = await tx.select({ scope: rankAxes.scope }).from(rankAxes).where(eq(rankAxes.id, axis));
    if (!a) throw new Error("축 없음");
    if (a.scope !== "day") return [point];
    const rows = await tx
        .select({ time: reviewPoints.tradeTime })
        .from(reviewPoints)
        .where(and(eq(reviewPoints.stockCode, point.stockCode), eq(reviewPoints.tradeDate, point.date)));
    return rows.map((r) => ({ stockCode: point.stockCode, date: point.date, time: r.time }));
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
async function resolveBetweenKey(tx: DbClient, axis: bigint, prevSlot: bigint | null, nextSlot: bigint | null): Promise<number> {
    const first = await midpointKey(tx, axis, prevSlot, nextSlot);
    if (first != null) return first;
    await reindexAxis(tx, axis);
    const retry = await midpointKey(tx, axis, prevSlot, nextSlot);
    if (retry == null) throw new Error("reindex 후에도 중간키 실패 — 인접하지 않은 경계 slot 의심");
    return retry;
}

/**
 * 두 이웃 slot 사이 새 order_key. 끝단(prev/next null)은 ±1, 빈 축은 0.
 * 양쪽 이웃이 있는데 부동소수 간격이 소진돼 엄격히 사이인 값이 없으면 null(→ 호출부가 reindex).
 */
async function midpointKey(tx: DbClient, axis: bigint, prevSlot: bigint | null, nextSlot: bigint | null): Promise<number | null> {
    const prev = prevSlot != null ? await keyOf(tx, axis, prevSlot) : null;
    const next = nextSlot != null ? await keyOf(tx, axis, nextSlot) : null;
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
 * slot·placement 는 그대로(키만 바뀜) → 순서 보존.
 *
 * **두 단계로 나누는 이유**: uq_rank_slot_position(axis, order_key) 이 생겼다. 한 건씩 최종값으로 옮기면
 * 아직 안 옮긴 slot 이 그 값을 쥐고 있어 중간에 부딪힌다(예: [0, 0.5] → 0.5 를 1 로 옮기려는데…가 아니라,
 * [0.5, 1] 에서 0.5→0 은 되지만 1→1 뒤 다음 것이 겹치는 식). Postgres 는 유니크를 문장 단위가 아니라
 * **행 단위로** 즉시 검사하므로 한 문장에 몰아도 같다 — DEFERRABLE 아니면 제자리 재번호는 불가능하다.
 * drizzle 이 유니크에 deferrable 을 표현하지 못해(nullsNotDistinct 만 있다) 스키마에 못 적으므로,
 * 손 SQL 로 걸어 스냅샷과 어긋나게 두느니 코드가 **매 문장 불변식을 지키게** 한다.
 */
async function reindexAxis(tx: DbClient, axis: bigint): Promise<void> {
    const slots = await tx
        .select({ id: rankSlots.id, orderKey: rankSlots.orderKey })
        .from(rankSlots)
        .where(eq(rankSlots.axisId, axis))
        .orderBy(asc(rankSlots.orderKey), asc(rankSlots.id));
    if (slots.length === 0) return;

    // 1단계 — 전부 임시 자리로 비킨다. 현재 최솟값(0 과 비교해 더 작은 쪽) **아래로** 하나씩 내려보내므로
    // 기존 값과도, 서로와도, 최종값(0 이상)과도 겹치지 않는다.
    const floor = Math.min(0, ...slots.map((s) => s.orderKey)) - 1;
    for (let i = 0; i < slots.length; i++) {
        await tx.update(rankSlots).set({ orderKey: floor - i }).where(eq(rankSlots.id, slots[i].id));
    }
    // 2단계 — 최종 자리로. 1단계 값이 전부 음수 아래라 여기서도 안 부딪힌다.
    for (let i = 0; i < slots.length; i++) {
        await tx.update(rankSlots).set({ orderKey: i }).where(eq(rankSlots.id, slots[i].id));
    }
}

/** slot 의 order_key(축 소속 검증). */
async function keyOf(tx: DbClient, axis: bigint, slotId: bigint): Promise<number> {
    const [s] = await tx
        .select({ orderKey: rankSlots.orderKey, axisId: rankSlots.axisId })
        .from(rankSlots)
        .where(eq(rankSlots.id, slotId));
    if (!s || s.axisId !== axis) throw new Error("경계 slot 이 이 축에 속하지 않음");
    return s.orderKey;
}

/** 축 이름 → id. 계약(이름)과 저장(id) 사이의 유일한 통로. */
async function axisIdOf(tx: DbClient, name: string): Promise<bigint> {
    const [row] = await tx.select({ id: rankAxes.id }).from(rankAxes).where(eq(rankAxes.name, name)).limit(1);
    if (!row) throw new Error(`없는 축: ${name}`);
    return row.id;
}

/**
 * 자리를 타점으로 지목 — 그 타점이 이 축에서 꽂혀 있는 slot.
 * 안 꽂힌 타점을 경계로 주는 건 호출자의 잘못이다(빈 자리는 지목할 수 없다는 규칙의 다른 얼굴).
 */
async function slotOfPlaced(tx: DbClient, axis: bigint, point: RankPoint): Promise<bigint> {
    const slot = await currentSlotOf(tx, axis, point);
    if (slot == null) throw new Error(`지목한 타점이 이 축에 배치돼 있지 않다: ${point.stockCode} ${point.date} ${point.time}`);
    return slot;
}

/** 경계는 생략 가능(줄 끝) — 생략이면 null, 줬는데 안 꽂혀 있으면 잘못이라 던진다. */
async function slotOfPlacedOpt(tx: DbClient, axis: bigint, point?: RankPoint): Promise<bigint | null> {
    return point === undefined ? null : slotOfPlaced(tx, axis, point);
}

/** slot 이 비었으면 삭제(유령 slot 방지). */
async function gcSlotIfEmpty(tx: DbClient, slotId: bigint): Promise<void> {
    const rows = await tx.select({ slotId: rankPlacements.slotId }).from(rankPlacements).where(eq(rankPlacements.slotId, slotId)).limit(1);
    if (rows.length === 0) await tx.delete(rankSlots).where(eq(rankSlots.id, slotId));
}
