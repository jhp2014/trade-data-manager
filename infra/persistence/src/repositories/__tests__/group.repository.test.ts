import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleGroupRepository } from "../group.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
const P3 = { stockCode: "000660", date: "2026-06-30", time: "09:30:00" };
const DAY1 = { stockCode: "005930", date: "2026-06-30" };
const DAY2 = { stockCode: "000660", date: "2026-06-30" };

describe("DrizzleGroupRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleGroupRepository;

    const groupNamesOf = async (item: { stockCode: string; date: string; time?: string }): Promise<string[]> =>
        (await repo.listAllMemberships())
            .find((m) => m.stockCode === item.stockCode && m.date === item.date && m.time === item.time)
            ?.groupNames.sort() ?? [];

    beforeEach(async () => {
        t = await createTestDb();
        repo = new DrizzleGroupRepository(t.db);
        await new DrizzleReviewPointRepository(t.db).upsert([P1, P2, P3]);
    });
    afterEach(async () => {
        await t.close();
    });

    it("createGroup — 이름순 목록, 같은 이름은 기존 그룹 반환(멱등)", async () => {
        const b = await repo.createGroup("형태:돌파", "point");
        await repo.createGroup("가:눌림", "point");
        expect((await repo.listGroups()).map((g) => g.name)).toEqual(["가:눌림", "형태:돌파"]);

        const again = await repo.createGroup("형태:돌파", "point");
        expect(again).toEqual(b); // 새로 만들지 않고 그 그룹을 그대로
        expect(await repo.listGroups()).toHaveLength(2);
    });

    it("계약에 id 가 없다 — 이름이 곧 정체성이다", async () => {
        // 로컬 미러와 Supabase 가 각자 id 를 발급하고 전체교체 때 갈리므로, id 가 새어 나가면
        // 동기화를 건넌 참조가 조용히 다른 행을 가리킨다. 그 통로를 타입으로 막아둔 것을 여기서 고정한다.
        const g = await repo.createGroup("A", "point");
        expect(Object.keys(g).sort()).toEqual(["name", "parentName", "scope"]);
    });

    it("새 그룹은 최상위다 — 부모는 나중에 손으로 정한다", async () => {
        const g = await repo.createGroup("미정1", "point");
        expect(g).toMatchObject({ parentName: null, scope: "point" });
    });

    it("attach/detach — 멱등이고, 한 항목에 여러 그룹", async () => {
        const x = await repo.createGroup("장초", "point");
        const y = await repo.createGroup("갭상승", "point");
        await repo.attach(x.name, P1);
        await repo.attach(x.name, P1); // 멱등
        await repo.attach(y.name, P1);

        expect(await groupNamesOf(P1)).toEqual([x.name, y.name].sort());

        await repo.detach(x.name, P1);
        expect(await groupNamesOf(P1)).toEqual([y.name]);
        await repo.detach(x.name, P1); // 안 붙어 있어도 조용히
    });

    it("하루 소속과 타점 소속이 한 피드에 온다 — 시각 유무로 갈린다", async () => {
        const day = await repo.createGroup("하루", "day");
        const point = await repo.createGroup("타점", "point");
        await repo.attach(day.name, DAY1);
        await repo.attach(point.name, P1);

        const feed = await repo.listAllMemberships();
        expect(feed).toHaveLength(2);
        expect(feed.find((m) => m.time === undefined)?.groupNames).toEqual([day.name]);
        expect(feed.find((m) => m.time === P1.time)?.groupNames).toEqual([point.name]);
    });

    it("scope 정합 — 하루 그룹에 시각을 넣거나 타점 그룹에서 빼면 거부", async () => {
        const day = await repo.createGroup("하루", "day");
        const point = await repo.createGroup("타점", "point");
        await expect(repo.attach(day.name, P1)).rejects.toThrow();
        await expect(repo.attach(point.name, DAY1)).rejects.toThrow();
        // 맞는 조합만 남는다
        await repo.attach(day.name, DAY2);
        await repo.attach(point.name, P2);
        expect(await repo.listAllMemberships()).toHaveLength(2);
    });

    it("없는 그룹에 붙이면 거부 — 이름이 키라 오타가 조용히 새 그룹을 만들면 안 된다", async () => {
        await expect(repo.attach("없는 그룹", P1)).rejects.toThrow();
    });

    it("그룹을 지우면 멤버십도 사라진다", async () => {
        const g = await repo.createGroup("임시", "point");
        await repo.attach(g.name, P1);
        await repo.removeGroup(g.name);
        expect(await repo.listAllMemberships()).toEqual([]);
    });

    it("renameGroup — 멤버십은 안에서 id 참조라 이름이 바뀌어도 따라온다", async () => {
        const g = await repo.createGroup("옛 이름", "point");
        await repo.attach(g.name, P1);
        await repo.renameGroup("옛 이름", "새 이름");
        expect((await repo.listGroups()).map((x) => x.name)).toEqual(["새 이름"]);
        expect(await groupNamesOf(P1)).toEqual(["새 이름"]);
    });

    describe("그룹 안 그룹", () => {
        it("부모가 걸린다 — 같은 층위끼리", async () => {
            const parent = await repo.createGroup("눌림 계열", "point");
            const child = await repo.createGroup("얕은 눌림", "point");

            await repo.setParent(child.name, parent.name);
            expect((await repo.listGroups()).find((g) => g.name === child.name)?.parentName).toBe(parent.name);
        });

        it("하루 그룹 아래 타점 그룹은 된다 — 하루가 더 넓다", async () => {
            await repo.createGroup("하루바구니", "day");
            await repo.createGroup("타점", "point");

            await repo.setParent("타점", "하루바구니");

            expect((await repo.listGroups()).find((g) => g.name === "타점")?.parentName).toBe("하루바구니");
        });

        // 계층 상속은 "자식에 속하면 부모에도 속한다" — 타점 밑에 하루를 넣으면 그 말이 거짓이 된다.
        it("⚠ 타점 그룹 아래 하루 그룹은 안 된다 — 상속이 거짓이 되는 방향", async () => {
            await repo.createGroup("타점바구니", "point");
            await repo.createGroup("하루", "day");

            await expect(repo.setParent("하루", "타점바구니")).rejects.toThrow(/층위/);
        });

        it("⚠ 순환은 거부된다 — 그리기가 무한히 내려간다", async () => {
            const a = await repo.createGroup("A", "point");
            const b = await repo.createGroup("B", "point");
            await repo.setParent(b.name, a.name);

            await expect(repo.setParent(a.name, b.name)).rejects.toThrow(); // 자기 자손을 부모로
            await expect(repo.setParent(a.name, a.name)).rejects.toThrow(); // 자기 자신을 부모로
        });

        it("부모를 풀면 최상위로 돌아간다", async () => {
            const parent = await repo.createGroup("부모", "point");
            const child = await repo.createGroup("자식", "point");
            await repo.setParent(child.name, parent.name);

            await repo.setParent(child.name, null);

            expect((await repo.listGroups()).find((g) => g.name === child.name)?.parentName).toBeNull();
        });
    });
});
