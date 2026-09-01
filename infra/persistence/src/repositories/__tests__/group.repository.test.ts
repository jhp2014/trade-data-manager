import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleGroupRepository } from "../group.repository.js";

// 멤버는 차트(종목, 날짜) 하나다 — 타점 층위는 2026-09-01 폐지.
const DAY1 = { stockCode: "005930", date: "2026-06-30" };
const DAY2 = { stockCode: "000660", date: "2026-06-30" };

describe("DrizzleGroupRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleGroupRepository;

    const groupNamesOf = async (item: { stockCode: string; date: string }): Promise<string[]> =>
        (await repo.listAllMemberships())
            .find((m) => m.stockCode === item.stockCode && m.date === item.date)
            ?.groupNames.sort() ?? [];

    beforeEach(async () => {
        t = await createTestDb();
        repo = new DrizzleGroupRepository(t.db);
    });
    afterEach(async () => {
        await t.close();
    });

    it("createGroup — 이름순 목록, 같은 이름은 기존 그룹 반환(멱등)", async () => {
        const b = await repo.createGroup("형태:돌파");
        await repo.createGroup("가:눌림");
        expect((await repo.listGroups()).map((g) => g.name)).toEqual(["가:눌림", "형태:돌파"]);

        const again = await repo.createGroup("형태:돌파");
        expect(again).toEqual(b); // 새로 만들지 않고 그 그룹을 그대로
        expect(await repo.listGroups()).toHaveLength(2);
    });

    it("계약에 id 가 없다 — 이름이 곧 정체성이다", async () => {
        // 로컬 미러와 Supabase 가 각자 id 를 발급하고 전체교체 때 갈리므로, id 가 새어 나가면
        // 동기화를 건넌 참조가 조용히 다른 행을 가리킨다. 그 통로를 타입으로 막아둔 것을 여기서 고정한다.
        const g = await repo.createGroup("A");
        expect(Object.keys(g).sort()).toEqual(["name", "parentName"]);
    });

    it("새 그룹은 최상위다 — 부모는 나중에 손으로 정한다", async () => {
        const g = await repo.createGroup("미정1");
        expect(g).toMatchObject({ parentName: null });
    });

    it("attach/detach — 멱등이고, 한 항목에 여러 그룹", async () => {
        const x = await repo.createGroup("장초");
        const y = await repo.createGroup("갭상승");
        await repo.attach(x.name, DAY1);
        await repo.attach(x.name, DAY1); // 멱등
        await repo.attach(y.name, DAY1);

        expect(await groupNamesOf(DAY1)).toEqual([x.name, y.name].sort());

        await repo.detach(x.name, DAY1);
        expect(await groupNamesOf(DAY1)).toEqual([y.name]);
        await repo.detach(x.name, DAY1); // 안 붙어 있어도 조용히
    });

    it("멤버십 피드는 항목 키로 접힌다 — 항목마다 한 행", async () => {
        const a = await repo.createGroup("A");
        const b = await repo.createGroup("B");
        await repo.attach(a.name, DAY1);
        await repo.attach(b.name, DAY1);
        await repo.attach(a.name, DAY2);

        const feed = await repo.listAllMemberships();
        expect(feed).toHaveLength(2);
        expect(feed.find((m) => m.stockCode === DAY1.stockCode)?.groupNames.sort()).toEqual([a.name, b.name].sort());
    });

    it("없는 그룹에 붙이면 거부 — 이름이 키라 오타가 조용히 새 그룹을 만들면 안 된다", async () => {
        await expect(repo.attach("없는 그룹", DAY1)).rejects.toThrow();
    });

    it("그룹을 지우면 멤버십도 사라진다", async () => {
        const g = await repo.createGroup("임시");
        await repo.attach(g.name, DAY1);
        await repo.removeGroup(g.name);
        expect(await repo.listAllMemberships()).toEqual([]);
    });

    it("renameGroup — 멤버십은 안에서 id 참조라 이름이 바뀌어도 따라온다", async () => {
        const g = await repo.createGroup("옛 이름");
        await repo.attach(g.name, DAY1);
        await repo.renameGroup("옛 이름", "새 이름");
        expect((await repo.listGroups()).map((x) => x.name)).toEqual(["새 이름"]);
        expect(await groupNamesOf(DAY1)).toEqual(["새 이름"]);
    });

    describe("그룹 안 그룹", () => {
        it("부모가 걸린다", async () => {
            const parent = await repo.createGroup("눌림 계열");
            const child = await repo.createGroup("얕은 눌림");

            await repo.setParent(child.name, parent.name);
            expect((await repo.listGroups()).find((g) => g.name === child.name)?.parentName).toBe(parent.name);
        });

        it("⚠ 순환은 거부된다 — 그리기가 무한히 내려간다", async () => {
            const a = await repo.createGroup("A");
            const b = await repo.createGroup("B");
            await repo.setParent(b.name, a.name);

            await expect(repo.setParent(a.name, b.name)).rejects.toThrow(); // 자기 자손을 부모로
            await expect(repo.setParent(a.name, a.name)).rejects.toThrow(); // 자기 자신을 부모로
        });

        it("없는 그룹을 부모로 두면 거부", async () => {
            await repo.createGroup("자식");
            await expect(repo.setParent("자식", "없는 그룹")).rejects.toThrow();
        });

        it("부모를 풀면 최상위로 돌아간다", async () => {
            const parent = await repo.createGroup("부모");
            const child = await repo.createGroup("자식");
            await repo.setParent(child.name, parent.name);

            await repo.setParent(child.name, null);

            expect((await repo.listGroups()).find((g) => g.name === child.name)?.parentName).toBeNull();
        });
    });
});
