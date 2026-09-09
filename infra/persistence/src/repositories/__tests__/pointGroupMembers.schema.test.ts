import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { groups, groupMembers, groupMembersPoint } from "../../schema/curation.js";

/**
 * 좌표 라벨(group_members_point) 스키마의 **계약** 테스트 — DB 가 보장하는 것들.
 *
 * 항목은 캔들 좌표(종목, 날짜, 분)다(2026-09-09) — Point(격자 파생물)가 아니라서 groups 밖으로
 * FK 가 없고, 격자가 재구워져도 라벨은 남는다(고아 = 정보). day 멤버십(group_members)과는
 * 테이블이 갈라져 있어(grain 혼합 기각) 서로의 유니크·삭제에 간섭하지 않는다.
 */
describe("좌표 라벨 멤버십 스키마 (pglite)", () => {
    let t: TestDb;
    let groupA: bigint;
    let groupB: bigint;

    const points = () => t.db.select().from(groupMembersPoint);

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

    it("멱등 부착 — 같은 좌표를 같은 그룹에 두 번 넣을 수 없다(uq_group_member_point)", async () => {
        const row = { groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01", time: "10:03:00" };
        await t.db.insert(groupMembersPoint).values(row);
        await expect(t.db.insert(groupMembersPoint).values(row)).rejects.toThrow();
    });

    it("같은 (그룹, 종목, 날짜)라도 시각이 다르면 각각 들어간다 — day 유니크와 독립인 4컬럼 키", async () => {
        await t.db.insert(groupMembersPoint).values([
            { groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01", time: "10:03:00" },
            { groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01", time: "10:04:00" },
        ]);
        expect(await points()).toHaveLength(2);
    });

    it("같은 좌표라도 그룹이 다르면 각각 들어간다 — 한 좌표는 여러 그룹에 속한다", async () => {
        await t.db.insert(groupMembersPoint).values([
            { groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01", time: "10:03:00" },
            { groupId: groupB, stockCode: "000660", tradeDate: "2026-07-01", time: "10:03:00" },
        ]);
        expect(await points()).toHaveLength(2);
    });

    it("그룹을 지우면 좌표 라벨도 함께 사라진다(cascade)", async () => {
        await t.db.insert(groupMembersPoint).values({ groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01", time: "10:03:00" });
        await t.db.delete(groups).where(eq(groups.id, groupA));
        expect(await points()).toHaveLength(0);
    });

    it("day 멤버십과 상호 무간섭 — 같은 (그룹, 종목, 날짜)를 양쪽에 넣고 한쪽만 지워도 남는 쪽은 산다", async () => {
        await t.db.insert(groupMembers).values({ groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01" });
        await t.db.insert(groupMembersPoint).values({ groupId: groupA, stockCode: "000660", tradeDate: "2026-07-01", time: "10:03:00" });

        await t.db.delete(groupMembers).where(eq(groupMembers.groupId, groupA));
        expect(await points()).toHaveLength(1);
        expect(await t.db.select().from(groupMembers)).toHaveLength(0);
    });
});
