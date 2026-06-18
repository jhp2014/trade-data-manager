import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DbReviewCaseSource } from "@/repositories/DbReviewCaseSource";
import { createTestDb, type TestDb } from "@/test-support/testDb";

let testDb: TestDb;
let source: DbReviewCaseSource;

/** 테스트용 최소 review 테이블(data-core 의 public.review_target/review_point 모사). */
async function createReviewTables(db: TestDb["db"]) {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS public.review_target (
        id bigserial PRIMARY KEY,
        stock_code varchar(10) NOT NULL,
        trade_date date NOT NULL,
        stock_name varchar(100)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS public.review_point (
        id bigserial PRIMARY KEY,
        review_target_id bigint NOT NULL,
        trade_time time NOT NULL
    )`);
}

async function seedPoint(
    db: TestDb["db"],
    p: { stockCode: string; tradeDate: string; stockName?: string; tradeTime?: string },
) {
    const res = await db.execute(sql`
        INSERT INTO public.review_target (stock_code, trade_date, stock_name)
        VALUES (${p.stockCode}, ${p.tradeDate}, ${p.stockName ?? null}) RETURNING id
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
    source = new DbReviewCaseSource(testDb.db);
});

afterAll(async () => {
    await testDb.close();
});

beforeEach(async () => {
    await testDb.db.execute(
        sql`TRUNCATE TABLE public.review_point, public.review_target RESTART IDENTITY`,
    );
});

describe("findOrphans", () => {
    it("빈 입력은 빈 결과", async () => {
        expect(await source.findOrphans([])).toEqual([]);
    });

    it("실재하는 caseId 는 고아가 아니다", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        expect(await source.findOrphans(["055550-2026-06-05-0911"])).toEqual([]);
    });

    it("시각 불일치/미존재 종목/형식불량은 고아", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        const orphans = await source.findOrphans([
            "055550-2026-06-05-1000", // 시각 불일치
            "999999-2026-06-05-0911", // 미존재 종목
            "쓰레기값", // 형식 불량
        ]);
        expect(orphans.sort()).toEqual(["055550-2026-06-05-1000", "999999-2026-06-05-0911", "쓰레기값"].sort());
    });

    it("시각 없는 caseId 는 target 존재로만 판정", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05" }); // target 만
        const orphans = await source.findOrphans(["055550-2026-06-05", "111111-2026-06-05"]);
        expect(orphans).toEqual(["111111-2026-06-05"]);
    });
});

describe("enrich", () => {
    it("실재하는 caseId 의 stockName 을 채우고, 없는 건 제외", async () => {
        await seedPoint(testDb.db, {
            stockCode: "055550",
            tradeDate: "2026-06-05",
            stockName: "신한지주",
            tradeTime: "09:11",
        });
        const result = await source.enrich([
            "055550-2026-06-05-0911",
            "999999-2026-06-05-0911",
        ]);
        expect(result).toEqual([
            {
                caseId: "055550-2026-06-05-0911",
                stockCode: "055550",
                stockName: "신한지주",
                tradeDate: "2026-06-05",
                tradeTime: "09:11",
            },
        ]);
    });
});

describe("listRecent", () => {
    it("일자·시각 내림차순으로 N개", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        await seedPoint(testDb.db, { stockCode: "005930", tradeDate: "2026-06-10", tradeTime: "13:20" });
        await seedPoint(testDb.db, { stockCode: "005930", tradeDate: "2026-06-10", tradeTime: "09:00" });

        const recent = await source.listRecent(2);
        expect(recent.map((c) => c.caseId)).toEqual([
            "005930-2026-06-10-1320",
            "005930-2026-06-10-0900",
        ]);
    });
});

describe("listByMonth", () => {
    it("해당 월의 review point 만", async () => {
        await seedPoint(testDb.db, { stockCode: "055550", tradeDate: "2026-06-05", tradeTime: "09:11" });
        await seedPoint(testDb.db, { stockCode: "005930", tradeDate: "2026-07-01", tradeTime: "10:00" });

        const june = await source.listByMonth("2026-06");
        expect(june.map((c) => c.caseId)).toEqual(["055550-2026-06-05-0911"]);
        expect(await source.listByMonth("2026-08")).toEqual([]);
    });
});
