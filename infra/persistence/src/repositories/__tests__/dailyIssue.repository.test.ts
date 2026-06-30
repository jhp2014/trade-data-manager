import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DailyIssue } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleDailyIssueRepository } from "../dailyIssue.repository.js";

const di = (over: Partial<DailyIssue> = {}): DailyIssue => ({
    date: "2026-06-30",
    stockCode: "005930",
    issue: "HBM 수급",
    author: "me",
    ...over,
});

describe("DrizzleDailyIssueRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleDailyIssueRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleDailyIssueRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("add 후 getByDate 로 조회 — comment null↔undefined 왕복", async () => {
        await repo.add([di({ comment: "전공정 호조" }), di({ stockCode: "000660", comment: undefined })]);
        const rows = await repo.getByDate("2026-06-30");
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.stockCode === "005930")?.comment).toBe("전공정 호조");
        expect(rows.find((r) => r.stockCode === "000660")?.comment).toBeUndefined();
    });

    it("add 멱등 — 같은 (date,stock,issue) 재입력은 기존 행(author·comment)을 안 덮음", async () => {
        await repo.add([di({ comment: "원본", author: "me" })]);
        await repo.add([di({ comment: "분류기덮어쓰기시도", author: "auto" })]);
        const row = (await repo.getByDate("2026-06-30")).find(
            (r) => r.stockCode === "005930" && r.issue === "HBM 수급",
        );
        expect(row?.author).toBe("me"); // 보존
        expect(row?.comment).toBe("전공정 호조"); // 첫 테스트의 원본 보존(ON CONFLICT DO NOTHING)
    });

    it("한 종목 당일 2개 이슈 = 2행", async () => {
        await repo.add([di({ stockCode: "111111", issue: "원전" }), di({ stockCode: "111111", issue: "초전도체" })]);
        const rows = (await repo.getByDate("2026-06-30")).filter((r) => r.stockCode === "111111");
        expect(rows.map((r) => r.issue).sort()).toEqual(["원전", "초전도체"]);
    });

    it("remove — 특정 행만 삭제, 같은 종목의 다른 이슈는 유지", async () => {
        await repo.remove("2026-06-30", "111111", "초전도체");
        const rows = (await repo.getByDate("2026-06-30")).filter((r) => r.stockCode === "111111");
        expect(rows.map((r) => r.issue)).toEqual(["원전"]);
    });

    it("빈 배열 add 는 no-op", async () => {
        await expect(repo.add([])).resolves.toBeUndefined();
    });
});
