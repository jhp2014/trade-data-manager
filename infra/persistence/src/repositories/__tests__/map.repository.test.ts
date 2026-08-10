import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleMapRepository } from "../map.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const ITEM_A = { stockCode: "005930", date: "2026-07-01" };
const ITEM_B = { stockCode: "000660", date: "2026-07-02" };
const POINT = { stockCode: "005930", date: "2026-07-01", time: "09:11:00" };

describe("DrizzleMapRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleMapRepository;

    beforeEach(async () => {
        t = await createTestDb();
        repo = new DrizzleMapRepository(t.db);
    });
    afterEach(async () => {
        await t.close();
    });

    it("빈 말뭉치 — 맵이 없으면 세 배열 다 비어 있다", async () => {
        expect(await repo.loadCorpus()).toEqual({ maps: [], groups: [], placements: [] });
    });

    it("맵 생성·이름변경·삭제 — 삭제는 자리도 함께 가져간다", async () => {
        const m = await repo.createMap("일봉", "day");
        expect(m).toMatchObject({ name: "일봉", scope: "day" });
        await repo.addPlacements(m.id, [{ item: ITEM_A, x: 1, y: 2 }]);

        await repo.renameMap(m.id, "일봉 형태");
        expect((await repo.loadCorpus()).maps[0]!.name).toBe("일봉 형태");

        await repo.removeMap(m.id);
        const after = await repo.loadCorpus();
        expect(after.maps).toEqual([]);
        expect(after.placements).toEqual([]);
    });

    it("자리 추가 — 응답이 입력 순서 그대로(낙관 갱신의 임시 id 와 짝짓는다)", async () => {
        const m = await repo.createMap("일봉", "day");
        const saved = await repo.addPlacements(m.id, [
            { item: ITEM_B, x: 10, y: 20 },
            { item: ITEM_A, x: 30, y: 40 },
        ]);

        expect(saved.map((p) => p.item.stockCode)).toEqual([ITEM_B.stockCode, ITEM_A.stockCode]);
        expect(saved[0]).toMatchObject({ mapId: m.id, x: 10, y: 20, groupId: null });
        expect(saved[0]!.item.time).toBeUndefined(); // day 자리엔 시각이 없다
    });

    it("한 항목을 여러 자리에 — 징검다리(같은 항목이 같은 맵에 여러 번)", async () => {
        const m = await repo.createMap("일봉", "day");
        const saved = await repo.addPlacements(m.id, [
            { item: ITEM_A, x: 1, y: 1 },
            { item: ITEM_A, x: 5, y: 5 },
            { item: ITEM_A, x: 3, y: 9 },
        ]);
        expect(new Set(saved.map((p) => p.id)).size).toBe(3);
        expect((await repo.loadCorpus()).placements).toHaveLength(3);
    });

    it("scope 정합 — day 맵에 시각을 넣거나 point 맵에 빼면 거부", async () => {
        const day = await repo.createMap("일봉", "day");
        const point = await repo.createMap("분봉", "point");
        await new DrizzleReviewPointRepository(t.db).upsert([POINT]);

        await expect(repo.addPlacements(day.id, [{ item: POINT, x: 1, y: 1 }])).rejects.toThrow();
        await expect(repo.addPlacements(point.id, [{ item: ITEM_A, x: 1, y: 1 }])).rejects.toThrow();

        // 맞는 조합은 통과하고, point 자리는 시각을 싣고 돌아온다.
        const [p] = await repo.addPlacements(point.id, [{ item: POINT, x: 1, y: 1 }]);
        expect(p!.item.time).toBe(POINT.time);
        expect(await repo.loadCorpus().then((c) => c.placements)).toHaveLength(1); // day 쪽은 안 들어갔다
    });

    it("없는 맵에는 자리를 못 붙인다", async () => {
        await expect(repo.addPlacements("999999", [{ item: ITEM_A, x: 1, y: 1 }])).rejects.toThrow();
    });

    it("이동 — 여럿 한 번, 다른 맵의 자리는 안 건드린다", async () => {
        const m1 = await repo.createMap("일봉", "day");
        const m2 = await repo.createMap("테마", "day");
        const [a, b] = await repo.addPlacements(m1.id, [
            { item: ITEM_A, x: 0, y: 0 },
            { item: ITEM_B, x: 0, y: 0 },
        ]);
        const [c] = await repo.addPlacements(m2.id, [{ item: ITEM_A, x: 0, y: 0 }]);

        // c 는 m2 소속이라 m1 이동에 섞여 들어와도 무시돼야 한다.
        await repo.movePlacements(m1.id, [
            { id: a!.id, x: 11, y: 22 },
            { id: b!.id, x: 33, y: 44 },
            { id: c!.id, x: 99, y: 99 },
        ]);

        const byId = new Map((await repo.loadCorpus()).placements.map((p) => [p.id, p]));
        expect(byId.get(a!.id)).toMatchObject({ x: 11, y: 22 });
        expect(byId.get(b!.id)).toMatchObject({ x: 33, y: 44 });
        expect(byId.get(c!.id)).toMatchObject({ x: 0, y: 0 });
    });

    it("자리 제거 — 항목이 아니라 그 자리만(형제 자리는 남는다)", async () => {
        const m = await repo.createMap("일봉", "day");
        const saved = await repo.addPlacements(m.id, [
            { item: ITEM_A, x: 1, y: 1 },
            { item: ITEM_A, x: 5, y: 5 },
        ]);

        await repo.removePlacements(m.id, [saved[0]!.id]);

        const left = (await repo.loadCorpus()).placements;
        expect(left).toHaveLength(1);
        expect(left[0]).toMatchObject({ id: saved[1]!.id, x: 5, y: 5 });
    });

    it("빈 배열은 조용한 no-op(호출부가 빈 드래그로 왕복만 하는 걸 막는다)", async () => {
        const m = await repo.createMap("일봉", "day");
        expect(await repo.addPlacements(m.id, [])).toEqual([]);
        await repo.movePlacements(m.id, []);
        await repo.removePlacements(m.id, []);
        expect((await repo.loadCorpus()).placements).toEqual([]);
    });
});
