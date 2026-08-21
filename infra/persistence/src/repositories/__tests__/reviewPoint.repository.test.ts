import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ReviewPoint } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";

const rp = (over: Partial<ReviewPoint> = {}): ReviewPoint => ({
    stockCode: "005930",
    date: "2026-06-30",
    time: "09:11:00",
    ...over,
});

describe("DrizzleReviewPointRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleReviewPointRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleReviewPointRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("upsert 후 listAllPoints — memo null↔undefined 왕복", async () => {
        await repo.upsert([rp({ time: "09:11:00", memo: "장초 급등" }), rp({ time: "09:35:00" })]);
        const rows = await repo.listAllPoints();
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.time === "09:11:00")?.memo).toBe("장초 급등");
        expect(rows.find((r) => r.time === "09:35:00")?.memo).toBeUndefined();
    });

    it("upsert 멱등 — 같은 (종목,날짜,시각) 재입력은 memo 를 갱신", async () => {
        await repo.upsert([rp({ time: "09:11:00", memo: "수정된 메모" })]);
        const rows = await repo.listAllPoints();
        expect(rows).toHaveLength(2); // 새 행 안 생김
        expect(rows.find((r) => r.time === "09:11:00")?.memo).toBe("수정된 메모");
    });

    it("listAllPoints — 날짜 내림차순, 같은 날 시각 오름차순", async () => {
        await repo.upsert([rp({ time: "13:20:00" }), rp({ time: "10:05:00" }), rp({ date: "2026-06-27", time: "11:00:00" })]);
        const rows = await repo.listAllPoints();
        // 최신 거래일(06-30)이 먼저, 그 안에서 시각 오름차순 — 옛 날(06-27)은 뒤.
        expect(rows.map((r) => `${r.date} ${r.time}`)).toEqual([
            "2026-06-30 09:11:00", "2026-06-30 09:35:00", "2026-06-30 10:05:00", "2026-06-30 13:20:00",
            "2026-06-27 11:00:00",
        ]);
    });

    it("remove — 자연키로 1개 삭제", async () => {
        await repo.remove("005930", "2026-06-30", "09:35:00");
        const rows = await repo.listAllPoints();
        expect(rows.map((r) => r.time)).toEqual(["09:11:00", "10:05:00", "13:20:00", "11:00:00"]);
    });

    it("outcome 왕복 + upsert 전체 덮어쓰기(부분갱신 아님)", async () => {
        await repo.upsert([rp({ time: "14:00:00", outcome: "성공", memo: "메모" })]);
        let rows = await repo.listAllPoints();
        expect(rows.find((r) => r.time === "14:00:00")?.outcome).toBe("성공");
        // 같은 키를 outcome 만 주고 재입력하면 memo 는 null 로 덮인다(전체 덮어쓰기 계약).
        await repo.upsert([rp({ time: "14:00:00", outcome: "실패" })]);
        rows = await repo.listAllPoints();
        const q = rows.find((r) => r.time === "14:00:00");
        expect(q?.outcome).toBe("실패");
        expect(q?.memo).toBeUndefined();
    });

    it("빈 배열 upsert 는 no-op", async () => {
        await expect(repo.upsert([])).resolves.toBeUndefined();
    });
});
