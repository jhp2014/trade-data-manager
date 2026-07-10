import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleHypothesisRepository } from "../hypothesis.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

describe("DrizzleHypothesisRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleHypothesisRepository;
    let points: DrizzleReviewPointRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleHypothesisRepository(t.db);
        points = new DrizzleReviewPointRepository(t.db);
        // 링크 대상 타점 선행 생성(hypothesis_points → review_points FK).
        await points.upsert([
            { stockCode: "005930", date: "2026-06-30", time: "09:11:00" },
            { stockCode: "005930", date: "2026-06-30", time: "10:00:00" },
        ]);
    });
    afterAll(async () => {
        await t.close();
    });

    it("create — id 부여 + listHypotheses", async () => {
        const h = await repo.create("장초 급등은 눌림에서 산다");
        expect(h.id).toBeTruthy();
        expect(h.text).toContain("눌림");
        const all = await repo.listHypotheses();
        expect(all.map((x) => x.text)).toContain("장초 급등은 눌림에서 산다");
    });

    it("update — 텍스트 수정(id 유지) + 없는 id 는 no-op", async () => {
        const h = await repo.create("오타가 있는 가서설");
        await repo.update(h.id!, "오타를 고친 가설");
        const found = (await repo.listHypotheses()).find((x) => x.id === h.id);
        expect(found?.text).toBe("오타를 고친 가설");
        // 없는 id 는 조용한 no-op(throw 없음, 아무 행도 안 바뀜).
        await expect(repo.update("999999999", "무시됨")).resolves.toBeUndefined();
        expect((await repo.listHypotheses()).some((x) => x.text === "무시됨")).toBe(false);
    });

    it("link/unlink — 자연키 정션 + 멱등", async () => {
        const [h] = await repo.listHypotheses();
        const l = { hypothesisId: h.id!, stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
        await repo.link(l);
        await repo.link(l); // 멱등 — 중복 안 생김
        let links = await repo.listLinks();
        expect(links.filter((x) => x.hypothesisId === h.id).length).toBe(1);
        expect(links[0]).toMatchObject({ hypothesisId: h.id, stockCode: "005930", date: "2026-06-30", time: "09:11:00" });
        await repo.unlink(l);
        links = await repo.listLinks();
        expect(links.filter((x) => x.hypothesisId === h.id).length).toBe(0);
    });

    it("link 은 존재하는 타점만 — 없는 타점(FK) 위반은 거부", async () => {
        const [h] = await repo.listHypotheses();
        await expect(
            repo.link({ hypothesisId: h.id!, stockCode: "999999", date: "2026-06-30", time: "09:11:00" }),
        ).rejects.toBeTruthy();
    });

    it("remove — 가설 삭제가 링크도 cascade", async () => {
        const h = await repo.create("삭제될 가설");
        await repo.link({ hypothesisId: h.id!, stockCode: "005930", date: "2026-06-30", time: "10:00:00" });
        expect((await repo.listLinks()).some((l) => l.hypothesisId === h.id)).toBe(true);
        await repo.remove(h.id!);
        expect((await repo.listHypotheses()).some((x) => x.id === h.id)).toBe(false);
        expect((await repo.listLinks()).some((l) => l.hypothesisId === h.id)).toBe(false);
    });

    it("addRelation/removeRelation — 멱등 + listRelations", async () => {
        const a = await repo.create("가설 A");
        const b = await repo.create("가설 B");
        const rel = await repo.addRelation({ fromId: a.id!, toId: b.id!, relationType: "better_than" });
        expect(rel.fromId).toBe(a.id);
        expect(rel.toId).toBe(b.id);
        expect(rel.relationType).toBe("better_than");
        // 멱등 — 같은 (from,type,to) 재요청은 새 행 없이 기존 관계 반환.
        const rel2 = await repo.addRelation({ fromId: a.id!, toId: b.id!, relationType: "better_than" });
        expect(rel2.id).toBe(rel.id);
        expect((await repo.listRelations()).filter((r) => r.id === rel.id).length).toBe(1);
        await repo.removeRelation(rel.id!);
        expect((await repo.listRelations()).some((r) => r.id === rel.id)).toBe(false);
    });
});
