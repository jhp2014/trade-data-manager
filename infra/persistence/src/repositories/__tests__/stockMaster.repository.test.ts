import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { StockMaster } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleStockMasterRepository } from "../stockMaster.repository.js";
import { stockMaster } from "../../schema/market.js";

const m = (stockCode: string, over: Partial<StockMaster> = {}): StockMaster => ({
    stockCode,
    name: "name",
    market: "거래소",
    listingDate: "2010-01-01",
    ipoPrice: null,
    ...over,
});

describe("DrizzleStockMasterRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleStockMasterRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleStockMasterRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("upsert: name·listingDate 는 갱신, ipoPrice(enrichment 값)는 보존", async () => {
        // enrichment 가 공모가를 채워둔 상태
        await repo.saveStockMasters([m("005930", { name: "삼성", ipoPrice: "30000" })]);
        // 라이브 유니버스 재수집(ipoPrice=null 로 들어옴) → 이름 갱신, 공모가는 안 지워져야
        await repo.saveStockMasters([m("005930", { name: "삼성전자", ipoPrice: null })]);

        const rows = await t.db.select().from(stockMaster).where(eq(stockMaster.stockCode, "005930"));
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("삼성전자"); // 갱신
        expect(rows[0].ipoPrice).toBe(30000); // 보존(null 로 안 덮임). ipo_price=integer → number
    });

    it("삭제 없이 누적 — 다른 종목 추가해도 기존 행 유지", async () => {
        await repo.saveStockMasters([m("000660", { name: "SK하이닉스" })]);
        const codes = (await t.db.select().from(stockMaster)).map((r) => r.stockCode);
        expect(codes).toContain("005930");
        expect(codes).toContain("000660");
    });

    it("빈 배열은 no-op", async () => {
        await expect(repo.saveStockMasters([])).resolves.toBeUndefined();
    });
});
