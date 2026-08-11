import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleGroupRepository } from "../group.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
const P3 = { stockCode: "000660", date: "2026-06-30", time: "09:30:00" };

describe("DrizzleGroupRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleGroupRepository;
    let points: DrizzleReviewPointRepository;

    const groupIdsOf = async (p: typeof P1): Promise<string[]> =>
        (await repo.listAllAttachments()).find((a) => a.stockCode === p.stockCode && a.date === p.date && a.time === p.time)?.groupIds ?? [];

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleGroupRepository(t.db);
        // 부착 대상 타점 선행 생성(review_point_tags → review_points FK).
        points = new DrizzleReviewPointRepository(t.db);
        await points.upsert([P1, P2, P3]);
    });
    afterAll(async () => {
        await t.close();
    });

    it("createGroup — id 부여 + 이름순 listGroups, 같은 이름은 기존 그룹 반환(멱등)", async () => {
        const b = await repo.createGroup("형태:돌파");
        const a = await repo.createGroup("가:눌림");
        expect(b.id).toBeTruthy();
        expect((await repo.listGroups()).map((x) => x.name)).toEqual(["가:눌림", "형태:돌파"]); // 이름 오름차순

        const again = await repo.createGroup("형태:돌파");
        expect(again.id).toBe(b.id); // 중복 생성이 아니라 그 그룹 선택
        expect(await repo.listGroups()).toHaveLength(2);
        expect(a.id).not.toBe(b.id);
    });

    it("attach — 멱등(같은 부착 2회 = 1건), 한 타점에 여러 그룹", async () => {
        const x = await repo.createGroup("장초");
        const y = await repo.createGroup("갭상승");
        await repo.attach(x.id, P1);
        await repo.attach(x.id, P1); // 멱등
        await repo.attach(y.id, P1);

        expect((await groupIdsOf(P1)).sort()).toEqual([x.id, y.id].sort());
    });

    it("listAllAttachments — 붙은 타점만 항목, groupIds 는 그룹 이름순", async () => {
        const first = await repo.createGroup("ㄱ이름");
        const last = await repo.createGroup("ㅎ이름");
        await repo.attach(last.id, P2);
        await repo.attach(first.id, P2);

        expect(await groupIdsOf(P2)).toEqual([first.id, last.id]); // 이름순(부착 순서 아님)
        expect(await groupIdsOf(P3)).toEqual([]); // 안 붙은 타점은 항목 자체가 없음
    });

    it("detach — 해당 부착만 제거, 없는 부착은 조용한 no-op", async () => {
        const z = await repo.createGroup("떼기");
        await repo.attach(z.id, P3);
        expect(await groupIdsOf(P3)).toEqual([z.id]);

        await repo.detach(z.id, P3);
        expect(await groupIdsOf(P3)).toEqual([]);
        await expect(repo.detach(z.id, P3)).resolves.toBeUndefined(); // 두 번 떼도 안전
    });

    it("renameGroup — 부착은 id 참조라 안 깨짐 / 없는 id 는 no-op", async () => {
        const group = await repo.createGroup("옛이름");
        await repo.attach(group.id, P3);
        await repo.renameGroup(group.id, "새이름");

        expect((await repo.listGroups()).find((x) => x.id === group.id)?.name).toBe("새이름");
        expect(await groupIdsOf(P3)).toEqual([group.id]); // 부착 유지
        await expect(repo.renameGroup("999999", "없음")).resolves.toBeUndefined();
    });

    it("removeGroup — 부착도 cascade 로 함께 사라진다", async () => {
        const doomed = await repo.createGroup("지울그룹");
        await repo.attach(doomed.id, P3);
        expect(await groupIdsOf(P3)).toContain(doomed.id);

        await repo.removeGroup(doomed.id);
        expect((await repo.listGroups()).map((x) => x.id)).not.toContain(doomed.id);
        expect(await groupIdsOf(P3)).not.toContain(doomed.id);
    });

    it("타점 삭제 → 그 타점 부착도 cascade", async () => {
        const group = await repo.createGroup("타점따라감");
        await repo.attach(group.id, P2);
        await points.remove(P2.stockCode, P2.date, P2.time);

        expect(await groupIdsOf(P2)).toEqual([]);
        expect((await repo.listGroups()).map((x) => x.id)).toContain(group.id); // 사전은 남는다
    });

    // ── 차트 부착 — 타점 부착과 사전을 공유하되 저장이 갈린다(review_points FK 없음: 차트는 행이 아니다).
    it("attachToChart — 타점이 없는 차트에도 붙는다(골격만 있는 차트가 분류 대상)", async () => {
        const C = { stockCode: "999999", date: "2026-07-01" }; // review_points 에 없는 (종목,날짜)
        const group = await repo.createGroup("차트분류");
        await repo.attachToChart(group.id, C);
        await repo.attachToChart(group.id, C); // 멱등

        const atts = await repo.listAllChartAttachments();
        expect(atts.find((a) => a.stockCode === C.stockCode && a.date === C.date)?.groupIds).toEqual([group.id]);
    });

    it("detachFromChart — 해당 부착만 제거, 두 번 떼도 안전. removeGroup 는 차트 부착도 cascade", async () => {
        const C = { stockCode: "888888", date: "2026-07-01" };
        const a = await repo.createGroup("ㄱ차트");
        const b = await repo.createGroup("ㅎ차트");
        await repo.attachToChart(b.id, C);
        await repo.attachToChart(a.id, C);
        const of = async () => (await repo.listAllChartAttachments()).find((x) => x.stockCode === C.stockCode)?.groupIds ?? [];
        expect(await of()).toEqual([a.id, b.id]); // 그룹 이름순(부착 순서 아님)

        await repo.detachFromChart(a.id, C);
        expect(await of()).toEqual([b.id]);
        await expect(repo.detachFromChart(a.id, C)).resolves.toBeUndefined();

        await repo.removeGroup(b.id);
        expect(await of()).toEqual([]); // cascade — 항목째 사라진다
    });
});
