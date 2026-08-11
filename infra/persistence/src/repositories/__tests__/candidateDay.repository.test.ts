import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleCandidateDayRepository } from "../candidateDay.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";
import { DrizzleGroupRepository } from "../group.repository.js";
import { chartAnchors, maps, mapPlacements } from "../../schema/curation.js";

/**
 * 후보 하루 = 큐레이션 편집물들의 합집합. 여기서 잠그는 건 **분모의 정의**다 —
 * 갈래 하나가 조용히 빠지면 모든 비율이 틀어지는데 화면에선 그냥 숫자가 조금 다를 뿐으로 보인다.
 */
describe("DrizzleCandidateDayRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleCandidateDayRepository;

    const keys = async (): Promise<string[]> => (await repo.listCandidateDays()).map((c) => `${c.stockCode}|${c.date}`);
    const tracesOf = async (stockCode: string, date: string): Promise<string[]> =>
        (await repo.listCandidateDays()).find((c) => c.stockCode === stockCode && c.date === date)?.traces.sort() ?? [];

    beforeEach(async () => {
        t = await createTestDb();
        repo = new DrizzleCandidateDayRepository(t.db);
    });
    afterEach(async () => {
        await t.close();
    });

    it("흔적이 없으면 후보도 없다", async () => {
        expect(await repo.listCandidateDays()).toEqual([]);
    });

    it("네 갈래가 각각 단독으로 후보를 만든다 — 타점 없이도", async () => {
        // ① 앵커만(기준선·골격이 여기 다 들어온다)
        await t.db.insert(chartAnchors).values({
            stockCode: "005930",
            tradeDate: "2026-07-01",
            param: "skeleton",
            anchorDate: "2026-06-20",
        });
        // ② 차트 그룹만
        const groups = new DrizzleGroupRepository(t.db);
        const group = await groups.createGroup("형태:돌파");
        await groups.attachToChart(group.id, { stockCode: "000660", date: "2026-07-02" });
        // ③ 타점만
        await new DrizzleReviewPointRepository(t.db).upsert([{ stockCode: "035420", date: "2026-07-03", time: "09:30:00" }]);
        // ④ 맵 배치만
        const [m] = await t.db.insert(maps).values({ name: "일봉", scope: "day" }).returning();
        await t.db
            .insert(mapPlacements)
            .values({ mapId: m!.id, stockCode: "051910", tradeDate: "2026-07-04", tradeTime: null, x: 1, y: 1 });

        expect(await keys()).toEqual([
            // 날짜 내림차순 → 종목 (서버가 정렬을 고정한다)
            "051910|2026-07-04",
            "035420|2026-07-03",
            "000660|2026-07-02",
            "005930|2026-07-01",
        ]);
        expect(await tracesOf("005930", "2026-07-01")).toEqual(["anchor"]);
        expect(await tracesOf("051910", "2026-07-04")).toEqual(["mapPlacement"]);
    });

    it("같은 하루의 여러 흔적은 한 건으로 접히고 근거가 모인다", async () => {
        await t.db.insert(chartAnchors).values([
            { stockCode: "005930", tradeDate: "2026-07-01", param: "baseline", anchorDate: "2026-06-20" },
            { stockCode: "005930", tradeDate: "2026-07-01", param: "skeleton", anchorDate: "2026-06-25" }, // 같은 갈래 2행
        ]);
        await new DrizzleReviewPointRepository(t.db).upsert([
            { stockCode: "005930", date: "2026-07-01", time: "09:30:00" },
            { stockCode: "005930", date: "2026-07-01", time: "10:00:00" }, // 같은 하루의 타점 둘
        ]);

        const all = await repo.listCandidateDays();
        expect(all).toHaveLength(1); // 하루는 한 건
        expect(await tracesOf("005930", "2026-07-01")).toEqual(["anchor", "reviewPoint"]); // 갈래당 한 번씩만
    });

    it("흔적을 지우면 후보에서 빠진다 — 분모가 편집을 따라 움직인다", async () => {
        const [row] = await t.db
            .insert(chartAnchors)
            .values({ stockCode: "005930", tradeDate: "2026-07-01", param: "skeleton", anchorDate: "2026-06-20" })
            .returning();
        expect(await keys()).toHaveLength(1);

        await t.db.delete(chartAnchors).where(eq(chartAnchors.id, row!.id));
        expect(await keys()).toEqual([]);
    });
});
