import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DbReviewPointProbe } from "@/repositories/DbReviewPointProbe";
import type { ReconcileCase } from "@/repositories/ReviewPointProbe";
import { createTestDb, type TestDb } from "@/test-support/testDb";

let testDb: TestDb;
let probe: DbReviewPointProbe;

/** 테스트용 최소 review 테이블(data-core 의 public.review_target/review_point 모사). */
async function createReviewTables(db: TestDb["db"]) {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS public.review_target (
        id bigserial PRIMARY KEY,
        stock_code varchar(10) NOT NULL,
        trade_date date NOT NULL
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS public.review_point (
        id bigserial PRIMARY KEY,
        review_target_id bigint NOT NULL,
        trade_time time NOT NULL
    )`);
}

async function seedPoint(
    db: TestDb["db"],
    p: { stockCode: string; tradeDate: string; tradeTime?: string },
) {
    const res = await db.execute(sql`
        INSERT INTO public.review_target (stock_code, trade_date)
        VALUES (${p.stockCode}, ${p.tradeDate}) RETURNING id
    `);
    const maybe = res as unknown as { rows?: { id: number }[] };
    const rows = maybe.rows ?? (res as unknown as { id: number }[]);
    const targetId = rows[0].id;
    if (p.tradeTime) {
        await db.execute(sql`
            INSERT INTO public.review_point (review_target_id, trade_time)
            VALUES (${targetId}, ${p.tradeTime})
        `);
    }
}

beforeAll(async () => {
    testDb = await createTestDb();
    await createReviewTables(testDb.db);
    probe = new DbReviewPointProbe(testDb.db);
});

afterAll(async () => {
    await testDb.close();
});

beforeEach(async () => {
    await testDb.db.execute(
        sql`TRUNCATE TABLE public.review_point, public.review_target RESTART IDENTITY`,
    );
});

const mk = (caseId: string, stockCode: string, tradeDate: string, tradeTime: string | null): ReconcileCase => ({
    caseId,
    stockCode,
    tradeDate,
    tradeTime,
});

describe("DbReviewPointProbe.findOrphans", () => {
    it("빈 입력은 빈 결과", async () => {
        expect(await probe.findOrphans([])).toEqual([]);
    });

    it("review_point 에 실재하는 case 는 고아가 아니다", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        const orphans = await probe.findOrphans([
            mk("055550-2026-06-05-0911", "055550", "2026-06-05", "09:11"),
        ]);
        expect(orphans).toEqual([]);
    });

    it("같은 종목·일자라도 시각이 다르면 고아", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        const orphans = await probe.findOrphans([
            mk("055550-2026-06-05-1000", "055550", "2026-06-05", "10:00"),
        ]);
        expect(orphans.map((o) => o.caseId)).toEqual(["055550-2026-06-05-1000"]);
    });

    it("존재하지 않는 종목은 고아", async () => {
        const orphans = await probe.findOrphans([
            mk("999999-2026-06-05-0911", "999999", "2026-06-05", "09:11"),
        ]);
        expect(orphans.map((o) => o.caseId)).toEqual(["999999-2026-06-05-0911"]);
    });

    it("시각 없는 case 는 review_target 존재만으로 판정", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05" }); // target 만, point 없음
        const orphans = await probe.findOrphans([
            mk("055550-2026-06-05", "055550", "2026-06-05", null), // target 있음 → 고아 아님
            mk("111111-2026-06-05", "111111", "2026-06-05", null), // target 없음 → 고아
        ]);
        expect(orphans.map((o) => o.caseId)).toEqual(["111111-2026-06-05"]);
    });

    it("혼합 입력에서 고아만 정확히 가려낸다", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        await seedPoint(testDb.db, { stockCode: "005930", tradeDate: "2026-06-10", tradeTime: "13:20" });
        const orphans = await probe.findOrphans([
            mk("055550-2026-06-05-0911", "055550", "2026-06-05", "09:11"), // 실재
            mk("005930-2026-06-10-1320", "005930", "2026-06-10", "13:20"), // 실재
            mk("005930-2026-06-10-0900", "005930", "2026-06-10", "09:00"), // 시각 불일치 → 고아
        ]);
        expect(orphans.map((o) => o.caseId)).toEqual(["005930-2026-06-10-0900"]);
    });
});
