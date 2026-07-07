import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DailyComment } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleDailyCommentRepository } from "../dailyComment.repository.js";

const dc = (over: Partial<DailyComment> = {}): DailyComment => ({
    date: "2026-06-30",
    stockCode: "005930",
    comment: "전공정 호조",
    author: "me",
    ...over,
});

describe("DrizzleDailyCommentRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleDailyCommentRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleDailyCommentRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("upsert 후 getByDate 로 조회 — 종목 정렬", async () => {
        await repo.upsert(dc({ stockCode: "005930", comment: "전공정 호조" }));
        await repo.upsert(dc({ stockCode: "000660", comment: "HBM 수급" }));
        const rows = await repo.getByDate("2026-06-30");
        expect(rows.map((r) => r.stockCode)).toEqual(["000660", "005930"]);
        expect(rows.find((r) => r.stockCode === "005930")?.comment).toBe("전공정 호조");
    });

    it("upsert 재입력 — 같은 (date,stock) 은 comment·author 를 덮어씀(1행 유지)", async () => {
        await repo.upsert(dc({ stockCode: "005930", comment: "수정됨", author: "you" }));
        const rows = (await repo.getByDate("2026-06-30")).filter((r) => r.stockCode === "005930");
        expect(rows).toHaveLength(1);
        expect(rows[0]?.comment).toBe("수정됨");
        expect(rows[0]?.author).toBe("you");
    });

    it("remove — 특정 종목 코멘트만 삭제", async () => {
        await repo.remove("2026-06-30", "005930");
        const rows = await repo.getByDate("2026-06-30");
        expect(rows.map((r) => r.stockCode)).toEqual(["000660"]);
    });

    it("다른 날짜와 격리", async () => {
        await repo.upsert(dc({ date: "2026-07-01", stockCode: "000660", comment: "익일" }));
        expect((await repo.getByDate("2026-06-30")).map((r) => r.stockCode)).toEqual(["000660"]);
        expect((await repo.getByDate("2026-07-01")).map((r) => r.stockCode)).toEqual(["000660"]);
    });
});
