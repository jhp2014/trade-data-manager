import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleGroupRepository } from "../group.repository.js";
import { DrizzleMapRepository } from "../map.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
const P3 = { stockCode: "000660", date: "2026-06-30", time: "09:30:00" };
const DAY1 = { stockCode: "005930", date: "2026-06-30" };
const DAY2 = { stockCode: "000660", date: "2026-06-30" };

describe("DrizzleGroupRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleGroupRepository;
    let maps: DrizzleMapRepository;

    const groupIdsOf = async (item: { stockCode: string; date: string; time?: string }): Promise<string[]> =>
        (await repo.listAllMemberships())
            .find((m) => m.stockCode === item.stockCode && m.date === item.date && m.time === item.time)
            ?.groupIds.sort() ?? [];

    beforeEach(async () => {
        t = await createTestDb();
        repo = new DrizzleGroupRepository(t.db);
        maps = new DrizzleMapRepository(t.db);
        await new DrizzleReviewPointRepository(t.db).upsert([P1, P2, P3]);
    });
    afterEach(async () => {
        await t.close();
    });

    it("createGroup — 이름순 목록, 같은 이름은 기존 그룹 반환(멱등)", async () => {
        const b = await repo.createGroup("형태:돌파", "point");
        const a = await repo.createGroup("가:눌림", "point");
        expect((await repo.listGroups()).map((g) => g.name)).toEqual(["가:눌림", "형태:돌파"]);

        const again = await repo.createGroup("형태:돌파", "point");
        expect(again.id).toBe(b.id);
        expect(await repo.listGroups()).toHaveLength(2);
        expect(a.id).not.toBe(b.id);
    });

    it("새 그룹은 어느 평면에도 안 올라가 있다 — 만들기와 올리기는 별개다", async () => {
        const g = await repo.createGroup("미정1", "point");
        expect(g).toMatchObject({ mapId: null, x: null, y: null, parentId: null, scope: "point" });
    });

    it("attach/detach — 멱등이고, 한 항목에 여러 그룹", async () => {
        const x = await repo.createGroup("장초", "point");
        const y = await repo.createGroup("갭상승", "point");
        await repo.attach(x.id, P1);
        await repo.attach(x.id, P1); // 멱등
        await repo.attach(y.id, P1);

        expect(await groupIdsOf(P1)).toEqual([x.id, y.id].sort());

        await repo.detach(x.id, P1);
        expect(await groupIdsOf(P1)).toEqual([y.id]);
        await repo.detach(x.id, P1); // 안 붙어 있어도 조용히
    });

    it("하루 소속과 타점 소속이 한 피드에 온다 — 시각 유무로 갈린다", async () => {
        const day = await repo.createGroup("하루", "day");
        const point = await repo.createGroup("타점", "point");
        await repo.attach(day.id, DAY1);
        await repo.attach(point.id, P1);

        const feed = await repo.listAllMemberships();
        expect(feed).toHaveLength(2);
        expect(feed.find((m) => m.time === undefined)?.groupIds).toEqual([day.id]);
        expect(feed.find((m) => m.time === P1.time)?.groupIds).toEqual([point.id]);
    });

    it("scope 정합 — 하루 그룹에 시각을 넣거나 타점 그룹에서 빼면 거부", async () => {
        const day = await repo.createGroup("하루", "day");
        const point = await repo.createGroup("타점", "point");
        await expect(repo.attach(day.id, P1)).rejects.toThrow();
        await expect(repo.attach(point.id, DAY1)).rejects.toThrow();
        // 맞는 조합만 남는다
        await repo.attach(day.id, DAY2);
        await repo.attach(point.id, P2);
        expect(await repo.listAllMemberships()).toHaveLength(2);
    });

    it("그룹을 지우면 멤버십도 사라진다", async () => {
        const g = await repo.createGroup("임시", "point");
        await repo.attach(g.id, P1);
        await repo.removeGroup(g.id);
        expect(await repo.listAllMemberships()).toEqual([]);
    });

    describe("평면에 올리기", () => {
        it("올리면 좌표가 붙고, 내리면 좌표·부모가 풀린다(그룹은 남는다)", async () => {
            const m = await maps.createMap("타점 맵", "point");
            const g = await repo.createGroup("A", "point");
            await repo.setPlacement(g.id, { mapId: m.id, x: 10, y: 20 });
            expect((await repo.listGroups())[0]).toMatchObject({ mapId: m.id, x: 10, y: 20 });

            await repo.setPlacement(g.id, null);
            expect((await repo.listGroups())[0]).toMatchObject({ mapId: null, x: null, y: null });
        });

        it("⚠ 평면과 그룹의 층위가 다르면 거부 — 한 평면에서 두 층위의 겹침을 같은 선으로 그리게 된다", async () => {
            const dayMap = await maps.createMap("하루 맵", "day");
            const pointGroup = await repo.createGroup("타점 그룹", "point");
            await expect(repo.setPlacement(pointGroup.id, { mapId: dayMap.id, x: 0, y: 0 })).rejects.toThrow();
        });

        it("평면을 지우면 그 위 그룹은 내려올 뿐 사라지지 않는다", async () => {
            const m = await maps.createMap("맵", "point");
            const g = await repo.createGroup("A", "point");
            await repo.setPlacement(g.id, { mapId: m.id, x: 1, y: 1 });

            await maps.removeMap(m.id);

            const left = await repo.listGroups();
            expect(left).toHaveLength(1);
            expect(left[0]).toMatchObject({ mapId: null, x: null, y: null });
        });

        it("moveGroups — 여럿 한 번에", async () => {
            const m = await maps.createMap("맵", "point");
            const a = await repo.createGroup("A", "point");
            const b = await repo.createGroup("B", "point");
            await repo.setPlacement(a.id, { mapId: m.id, x: 0, y: 0 });
            await repo.setPlacement(b.id, { mapId: m.id, x: 0, y: 0 });

            await repo.moveGroups([{ id: a.id, x: 11, y: 22 }, { id: b.id, x: 33, y: 44 }]);

            const byId = new Map((await repo.listGroups()).map((g) => [g.id, g]));
            expect(byId.get(a.id)).toMatchObject({ x: 11, y: 22 });
            expect(byId.get(b.id)).toMatchObject({ x: 33, y: 44 });
        });
    });

    describe("그룹 안 그룹", () => {
        it("같은 평면이면 부모가 걸린다", async () => {
            const m = await maps.createMap("맵", "point");
            const parent = await repo.createGroup("눌림 계열", "point");
            const child = await repo.createGroup("얕은 눌림", "point");
            await repo.setPlacement(parent.id, { mapId: m.id, x: 0, y: 0 });
            await repo.setPlacement(child.id, { mapId: m.id, x: 1, y: 1 });

            await repo.setParent(child.id, parent.id);
            expect((await repo.listGroups()).find((g) => g.id === child.id)?.parentId).toBe(parent.id);
        });

        it("⚠ 다른 평면(또는 안 올린 그룹)은 부모가 될 수 없다", async () => {
            const m = await maps.createMap("맵", "point");
            const onMap = await repo.createGroup("올린 것", "point");
            const off = await repo.createGroup("안 올린 것", "point");
            await repo.setPlacement(onMap.id, { mapId: m.id, x: 0, y: 0 });
            await expect(repo.setParent(onMap.id, off.id)).rejects.toThrow();
        });

        it("⚠ 순환은 거부된다 — 그리기가 무한히 내려간다", async () => {
            const m = await maps.createMap("맵", "point");
            const a = await repo.createGroup("A", "point");
            const b = await repo.createGroup("B", "point");
            for (const g of [a, b]) await repo.setPlacement(g.id, { mapId: m.id, x: 0, y: 0 });
            await repo.setParent(b.id, a.id);

            await expect(repo.setParent(a.id, b.id)).rejects.toThrow(); // 자기 자손을 부모로
            await expect(repo.setParent(a.id, a.id)).rejects.toThrow(); // 자기 자신을 부모로
        });

        it("평면에서 내리면 자식들도 함께 내려온다 — 부모 없는 자식이 떠 있지 않게", async () => {
            const m = await maps.createMap("맵", "point");
            const parent = await repo.createGroup("부모", "point");
            const child = await repo.createGroup("자식", "point");
            await repo.setPlacement(parent.id, { mapId: m.id, x: 0, y: 0 });
            await repo.setPlacement(child.id, { mapId: m.id, x: 1, y: 1 });
            await repo.setParent(child.id, parent.id);

            await repo.setPlacement(parent.id, null);

            expect((await repo.listGroups()).find((g) => g.id === child.id)?.parentId).toBeNull();
        });
    });
});
