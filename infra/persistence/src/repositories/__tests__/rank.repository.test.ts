import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleRankRepository } from "../rank.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";
import { rankSlots } from "../../schema/curation.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
const P3 = { stockCode: "000660", date: "2026-06-30", time: "09:30:00" };

describe("DrizzleRankRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleRankRepository;

    const slotCount = (axisId: string) =>
        t.db.select({ id: rankSlots.id }).from(rankSlots).where(eq(rankSlots.axisId, BigInt(axisId))).then((r) => r.length);

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleRankRepository(t.db);
        // 배치 대상 타점 선행 생성(rank_placements → review_points FK).
        await new DrizzleReviewPointRepository(t.db).upsert([P1, P2, P3]);
    });
    afterAll(async () => {
        await t.close();
    });

    it("createAxis — id 부여 + listAxes + 이름 unique", async () => {
        const a = await repo.createAxis("일봉-형태");
        expect(a.id).toBeTruthy();
        expect((await repo.listAxes()).map((x) => x.name)).toContain("일봉-형태");
        await expect(repo.createAxis("일봉-형태")).rejects.toBeTruthy(); // uq_rank_axis_name
    });

    it("place between(빈 축) → order_key 0, 끝단 삽입은 ±1", async () => {
        const a = await repo.createAxis("테마");
        const s1 = await repo.place(a.id, P1, { kind: "between" }); // 빈 축 → 0
        expect(s1.orderKey).toBe(0);
        const s2 = await repo.place(a.id, P2, { kind: "between", prevSlotId: s1.slotId }); // prev=0, next 없음 → +1
        expect(s2.orderKey).toBe(1);
        const s3 = await repo.place(a.id, P3, { kind: "between", nextSlotId: s1.slotId }); // next=0, prev 없음 → -1
        expect(s3.orderKey).toBe(-1);

        const line = await repo.listAxisLine(a.id);
        expect(line.map((p) => p.stockCode)).toEqual(["000660", "005930", "005930"]); // order_key -1,0,1 오름차순
        expect(line.map((p) => p.time)).toEqual(["09:30:00", "09:11:00", "10:00:00"]);
    });

    it("place slot → 타이(같은 slot·같은 key 공유)", async () => {
        const a = await repo.createAxis("거래대금");
        const s1 = await repo.place(a.id, P1, { kind: "between" });
        const s2 = await repo.place(a.id, P2, { kind: "slot", slotId: s1.slotId }); // 합류
        expect(s2.slotId).toBe(s1.slotId);
        expect(s2.orderKey).toBe(s1.orderKey);
        expect(await slotCount(a.id)).toBe(1); // 타이 1칸

        const line = await repo.listAxisLine(a.id);
        expect(line).toHaveLength(2);
        expect(new Set(line.map((p) => p.slotId))).toEqual(new Set([s1.slotId]));
    });

    it("place 재호출 = 이동(멱등 upsert) + 비워진 옛 slot GC", async () => {
        const a = await repo.createAxis("끼");
        const s1 = await repo.place(a.id, P1, { kind: "between" }); // slotA
        const s2 = await repo.place(a.id, P2, { kind: "between", prevSlotId: s1.slotId }); // slotB(혼자)
        expect(await slotCount(a.id)).toBe(2);

        // P2 를 slotA 로 이동 → slotB 비어 GC, slotA 는 P1·P2 타이.
        const moved = await repo.place(a.id, P2, { kind: "slot", slotId: s1.slotId });
        expect(moved.slotId).toBe(s1.slotId);
        expect(await slotCount(a.id)).toBe(1); // slotB GC
        expect((await repo.listAxisLine(a.id)).map((p) => p.slotId)).toEqual([s1.slotId, s1.slotId]);
        expect(s2.slotId).not.toBe(s1.slotId); // (이전 slotB 는 사라짐)
    });

    it("unplace — 배치 제거 + 마지막 멤버면 slot GC, 없는 배치는 no-op", async () => {
        const a = await repo.createAxis("일봉-위치");
        const s1 = await repo.place(a.id, P1, { kind: "between" });
        await repo.place(a.id, P2, { kind: "slot", slotId: s1.slotId }); // 타이(2명)

        await repo.unplace(a.id, P1); // 아직 P2 남음 → slot 유지
        expect(await slotCount(a.id)).toBe(1);
        expect(await repo.listAxisLine(a.id)).toHaveLength(1);

        await repo.unplace(a.id, P2); // 마지막 → slot GC
        expect(await slotCount(a.id)).toBe(0);
        expect(await repo.listAxisLine(a.id)).toHaveLength(0);

        await expect(repo.unplace(a.id, P3)).resolves.toBeUndefined(); // 없는 배치 no-op
    });

    it("removeAxis — slot·placement 까지 cascade", async () => {
        const a = await repo.createAxis("삭제될 축");
        const s1 = await repo.place(a.id, P1, { kind: "between" });
        await repo.place(a.id, P2, { kind: "slot", slotId: s1.slotId });
        expect(await slotCount(a.id)).toBe(1);

        await repo.removeAxis(a.id);
        expect((await repo.listAxes()).some((x) => x.id === a.id)).toBe(false);
        expect(await slotCount(a.id)).toBe(0); // slot cascade
        expect(await repo.listAxisLine(a.id)).toHaveLength(0); // placement cascade
    });

    it("place between — 간격 소진 시 자동 reindex(같은 틈 반복 삽입에도 순서 보존)", async () => {
        const a = await repo.createAxis("reindex 축");
        const N = 60;
        // 비-0 앵커(top=1) 쪽으로 압착하면 ~52회쯤 double 간격 소진 → 자동 reindex 발동.
        const pts = Array.from({ length: N }, (_, i) => ({ stockCode: "100000", date: "2026-06-30", time: `09:${String(i).padStart(2, "0")}:00` }));
        await new DrizzleReviewPointRepository(t.db).upsert(pts);

        const bottom = await repo.place(a.id, pts[0], { kind: "between" }); // key 0(최하단)
        const top = await repo.place(a.id, pts[1], { kind: "between", prevSlotId: bottom.slotId }); // key 1(최상단, 고정 앵커)
        let inner = bottom;
        for (let i = 2; i < N; i++) {
            inner = await repo.place(a.id, pts[i], { kind: "between", prevSlotId: inner.slotId, nextSlotId: top.slotId });
        }

        const line = await repo.listAxisLine(a.id);
        expect(line).toHaveLength(N); // 전원 배치 성공(throw·소진 없음)
        for (let i = 1; i < line.length; i++) expect(line[i].orderKey).toBeGreaterThan(line[i - 1].orderKey); // 키 순증가(중복·역전 없음)
        expect(line[0].time).toBe("09:00:00"); // 최하단 유지
        expect(line[line.length - 1].time).toBe("09:01:00"); // 최상단(top) 유지
    });

    it("place 는 존재하는 타점만 — 없는 타점(FK) 위반은 거부", async () => {
        const a = await repo.createAxis("FK 검증 축");
        await expect(repo.place(a.id, { stockCode: "999999", date: "2026-06-30", time: "09:00:00" }, { kind: "between" })).rejects.toBeTruthy();
    });

    it("createAxis scope — 기본 point, day 저장/조회", async () => {
        const p = await repo.createAxis("scope 기본");
        expect(p.scope).toBe("point");
        const d = await repo.createAxis("scope day", "day");
        expect(d.scope).toBe("day");
        expect((await repo.listAxes()).find((x) => x.id === d.id)?.scope).toBe("day");
    });

    it("day 축 place — 그날 전 타점에 fanout(같은 slot, 미배치 타점도 끌어옴)", async () => {
        const a = await repo.createAxis("일봉(day)", "day");
        const r = await repo.place(a.id, P1, { kind: "between" }); // P1 하나로 호출 → 005930·06-30 전 타점(P1,P2)
        const line = await repo.listAxisLine(a.id);
        expect(line).toHaveLength(2); // P1·P2 둘 다 보임(point 축과 동일한 줄)
        expect(new Set(line.map((p) => p.slotId))).toEqual(new Set([r.slotId])); // 한 slot 에 타이
        expect(line.map((p) => p.time).sort()).toEqual(["09:11:00", "10:00:00"]);
        expect(await slotCount(a.id)).toBe(1); // 다른 종목(P3)은 무관
    });

    it("day 축 이동 — 그날 타점 통째 이동 + 옛 slot GC(어느 타점으로 호출하든)", async () => {
        const a = await repo.createAxis("끼(day)", "day");
        const other = await repo.place(a.id, P3, { kind: "between" }); // 000660 day(P3) → slotA
        await repo.place(a.id, P1, { kind: "between", prevSlotId: other.slotId }); // 005930 day(P1·P2) → slotB
        expect(await slotCount(a.id)).toBe(2);

        // 005930 day 를 slotA 로 이동 — P2 로 호출해도 그날 전체(P1·P2) 이동, slotB 비어 GC.
        const moved = await repo.place(a.id, P2, { kind: "slot", slotId: other.slotId });
        expect(moved.slotId).toBe(other.slotId);
        expect(await slotCount(a.id)).toBe(1);
        const line = await repo.listAxisLine(a.id);
        expect(line).toHaveLength(3); // P3·P1·P2 한 slot
        expect(new Set(line.map((p) => p.slotId))).toEqual(new Set([other.slotId]));
    });

    it("day 축 unplace — 그날 전 타점 제거 + slot GC(어느 타점으로 호출하든)", async () => {
        const a = await repo.createAxis("테마(day)", "day");
        await repo.place(a.id, P1, { kind: "between" }); // P1·P2 배치
        expect(await repo.listAxisLine(a.id)).toHaveLength(2);
        await repo.unplace(a.id, P2); // P2 로 호출 → 그날 전체 제거
        expect(await repo.listAxisLine(a.id)).toHaveLength(0);
        expect(await slotCount(a.id)).toBe(0);
    });

    it("day 축 place — 그날 타점 0개면 거부", async () => {
        const a = await repo.createAxis("거래대금(day)", "day");
        await expect(repo.place(a.id, { stockCode: "005930", date: "2020-01-01", time: "09:00:00" }, { kind: "between" })).rejects.toBeTruthy();
    });
});
