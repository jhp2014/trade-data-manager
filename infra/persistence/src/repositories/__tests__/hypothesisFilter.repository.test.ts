import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { HypothesisFilterExpr } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleHypothesisFilterRepository } from "../hypothesisFilter.repository.js";

const expr = (): HypothesisFilterExpr => ({
    groups: [[{ hypothesisId: "1", negated: false }, { hypothesisId: "2", negated: true }]],
});

describe("DrizzleHypothesisFilterRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleHypothesisFilterRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleHypothesisFilterRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("save — id 부여 + expr 라운드트립", async () => {
        const f = await repo.save("눌림 성공셋", expr());
        expect(f.id).toBeTruthy();
        expect(f.name).toBe("눌림 성공셋");
        expect(f.expr).toEqual(expr());
        expect(f.createdAt).toBeTruthy();
        const all = await repo.listFilters();
        expect(all.map((x) => x.name)).toContain("눌림 성공셋");
    });

    it("save — 같은 이름은 식 덮어쓰기(upsert, 새 행 X)", async () => {
        const first = await repo.save("덮어쓰기", expr());
        const next: HypothesisFilterExpr = { groups: [[{ hypothesisId: "9", negated: false }]] };
        const second = await repo.save("덮어쓰기", next);
        expect(second.id).toBe(first.id); // 같은 행
        expect(second.expr).toEqual(next);
        expect((await repo.listFilters()).filter((x) => x.name === "덮어쓰기").length).toBe(1);
    });

    it("remove — 삭제", async () => {
        const f = await repo.save("삭제될 필터", expr());
        await repo.remove(f.id!);
        expect((await repo.listFilters()).some((x) => x.id === f.id)).toBe(false);
    });

    it("listFilters — 이름순 정렬", async () => {
        await repo.save("가나다", expr());
        await repo.save("하하하", expr());
        const names = (await repo.listFilters()).map((x) => x.name);
        const sorted = [...names].sort();
        expect(names).toEqual(sorted);
    });
});
