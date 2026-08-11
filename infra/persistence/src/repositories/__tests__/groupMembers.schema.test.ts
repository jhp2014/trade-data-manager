import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { groups, groupMembers } from "../../schema/curation.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

/**
 * 그룹 멤버십 스키마의 **계약** 테스트. 여기서 잠그는 건 코드가 아니라 DB 가 보장하는 것들이다.
 *
 * 핵심은 `group_members` 의 review_points 복합 FK 가 **MATCH SIMPLE**(Postgres 기본)이라는 점 —
 * 참조 컬럼 중 하나라도 NULL 이면 검사를 건너뛴다. 이 비대칭 위에 "하루 멤버십은 타점 없이 살고,
 * 타점 멤버십은 타점과 함께 죽는다"가 통째로 얹혀 있는데 컬럼만 봐서는 안 보인다.
 */
const POINT = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };

describe("그룹 멤버십 스키마 (pglite)", () => {
    let t: TestDb;
    let dayGroup: bigint;
    let pointGroup: bigint;

    const members = () => t.db.select().from(groupMembers);

    beforeEach(async () => {
        t = await createTestDb();
        await new DrizzleReviewPointRepository(t.db).upsert([POINT]);
        const [d] = await t.db.insert(groups).values({ name: "하루 그룹", scope: "day" }).returning();
        const [p] = await t.db.insert(groups).values({ name: "타점 그룹", scope: "point" }).returning();
        dayGroup = d!.id;
        pointGroup = p!.id;
    });
    afterEach(async () => {
        await t.close();
    });

    it("하루 멤버십(trade_time NULL)은 타점이 없어도 들어간다 — MATCH SIMPLE", async () => {
        // 골격만 그려둔 하루도 분류 대상이다. 이 하루에 대응하는 review_point 는 없다.
        await t.db.insert(groupMembers).values({ groupId: dayGroup, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null });
        expect(await members()).toHaveLength(1);
    });

    it("타점 멤버십은 타점이 없으면 거부된다", async () => {
        await expect(
            t.db.insert(groupMembers).values({ groupId: pointGroup, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: "09:30:00" }),
        ).rejects.toThrow();
    });

    it("타점을 지우면 타점 멤버십만 사라진다 — 하루 멤버십은 남는다", async () => {
        await t.db.insert(groupMembers).values([
            { groupId: pointGroup, stockCode: POINT.stockCode, tradeDate: POINT.date, tradeTime: POINT.time },
            { groupId: dayGroup, stockCode: POINT.stockCode, tradeDate: POINT.date, tradeTime: null },
        ]);

        await new DrizzleReviewPointRepository(t.db).remove(POINT.stockCode, POINT.date, POINT.time);

        const left = await members();
        expect(left).toHaveLength(1);
        expect(left[0]!.tradeTime).toBeNull(); // 차트의 분류는 진입점보다 오래 산다
    });

    it("멱등 부착 — 같은 하루를 같은 그룹에 두 번 넣을 수 없다(부분 유니크 인덱스)", async () => {
        const row = { groupId: dayGroup, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null };
        await t.db.insert(groupMembers).values(row);
        await expect(t.db.insert(groupMembers).values(row)).rejects.toThrow();
    });

    it("멱등 부착 — 같은 타점을 같은 그룹에 두 번 넣을 수 없다", async () => {
        const row = { groupId: pointGroup, stockCode: POINT.stockCode, tradeDate: POINT.date, tradeTime: POINT.time };
        await t.db.insert(groupMembers).values(row);
        await expect(t.db.insert(groupMembers).values(row)).rejects.toThrow();
    });

    it("같은 하루라도 그룹이 다르면 각각 들어간다 — 한 항목은 여러 그룹에 속한다(징검다리의 재료)", async () => {
        await t.db.insert(groupMembers).values([
            { groupId: dayGroup, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null },
            { groupId: pointGroup, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null },
        ]);
        expect(await members()).toHaveLength(2);
    });

    it("그룹을 지우면 멤버십도 함께 사라진다", async () => {
        await t.db.insert(groupMembers).values({ groupId: dayGroup, stockCode: "000660", tradeDate: "2026-07-01", tradeTime: null });
        await t.db.delete(groups).where(eq(groups.id, dayGroup));
        expect(await members()).toHaveLength(0);
    });

    it("부모를 지우면 자식은 최상위가 된다(SET NULL) — 그룹 자체는 살아남는다", async () => {
        const [child] = await t.db.insert(groups).values({ name: "자식", scope: "day", parentId: dayGroup }).returning();
        await t.db.delete(groups).where(eq(groups.id, dayGroup));
        const rows = await t.db.select().from(groups).where(eq(groups.id, child!.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.parentId).toBeNull();
    });

    it("그룹 이름은 유일하다", async () => {
        await expect(t.db.insert(groups).values({ name: "하루 그룹", scope: "day" })).rejects.toThrow();
    });
});
