import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { groups, groupMembers } from "../../schema/curation.js";

/**
 * 그룹 멤버십 스키마의 **계약** 테스트. 여기서 잠그는 건 코드가 아니라 DB 가 보장하는 것들이다.
 *
 * 멤버는 언제나 차트(종목, 날짜) 하나다(2026-09-01 타점 층위 폐지) — 옛 review_points 복합 FK 의
 * MATCH SIMPLE 비대칭("하루는 타점 없이 살고 타점 멤버십은 함께 죽는다")과 grain 별 부분 유니크
 * 인덱스 둘은 그때 사라졌고, 지금 남은 건 (그룹, 종목, 날짜) 유니크 하나다.
 */
describe("그룹 멤버십 스키마 (pglite)", () => {
    let t: TestDb;
    let groupA: bigint;
    let groupB: bigint;

    const members = () => t.db.select().from(groupMembers);

    beforeEach(async () => {
        t = await createTestDb();
        const [a] = await t.db.insert(groups).values({ name: "그룹 A" }).returning();
        const [b] = await t.db.insert(groups).values({ name: "그룹 B" }).returning();
        groupA = a!.id;
        groupB = b!.id;
    });
    afterEach(async () => {
        await t.close();
    });

    it("멤버십은 타점 없이 들어간다 — 차트의 분류는 그 자체로 선다", async () => {
        await t.db.insert(groupMembers).values({ groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01" });
        expect(await members()).toHaveLength(1);
    });

    it("멱등 부착 — 같은 하루를 같은 그룹에 두 번 넣을 수 없다(uq_group_member_day)", async () => {
        const row = { groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01" };
        await t.db.insert(groupMembers).values(row);
        await expect(t.db.insert(groupMembers).values(row)).rejects.toThrow();
    });

    it("같은 하루라도 그룹이 다르면 각각 들어간다 — 한 항목은 여러 그룹에 속한다(징검다리의 재료)", async () => {
        await t.db.insert(groupMembers).values([
            { groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01" },
            { groupId: groupB, stockCode: "000660", tradeDate: "2026-07-01" },
        ]);
        expect(await members()).toHaveLength(2);
    });

    it("그룹을 지우면 멤버십도 함께 사라진다", async () => {
        await t.db.insert(groupMembers).values({ groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01" });
        await t.db.delete(groups).where(eq(groups.id, groupA));
        expect(await members()).toHaveLength(0);
    });

    it("부모를 지우면 자식은 최상위가 된다(SET NULL) — 그룹 자체는 살아남는다", async () => {
        const [child] = await t.db.insert(groups).values({ name: "자식", parentId: groupA }).returning();
        await t.db.delete(groups).where(eq(groups.id, groupA));
        const rows = await t.db.select().from(groups).where(eq(groups.id, child!.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.parentId).toBeNull();
    });

    it("그룹 이름은 유일하다", async () => {
        await expect(t.db.insert(groups).values({ name: "그룹 A" })).rejects.toThrow();
    });
});
