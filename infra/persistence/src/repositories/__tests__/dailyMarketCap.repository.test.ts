import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DailyMarketCap } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleDailyMarketCapRepository } from "../dailyMarketCap.repository.js";

const cap = (stockCode: string, date: string, marketCap: string): DailyMarketCap => ({
    stockCode,
    date,
    marketCap,
});

describe("DrizzleDailyMarketCapRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleDailyMarketCapRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleDailyMarketCapRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("getByDateAndCodes — 그 날짜·코드만(다른 날·없는 코드 제외), bigint↔string 왕복", async () => {
        await repo.saveMarketCaps([
            cap("005930", "2026-06-26", "400000000000000"),
            cap("000660", "2026-06-26", "100000000000000"),
            cap("005930", "2026-06-25", "399000000000000"), // 다른 날
        ]);
        const got = await repo.getByDateAndCodes("2026-06-26", ["005930", "999999"]);
        expect(got).toEqual([cap("005930", "2026-06-26", "400000000000000")]);
    });

    it("빈 코드 → 빈 결과", async () => {
        expect(await repo.getByDateAndCodes("2026-06-26", [])).toEqual([]);
    });
});
