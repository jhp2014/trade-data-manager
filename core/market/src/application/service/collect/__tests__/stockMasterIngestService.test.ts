import { describe, it, expect } from "vitest";
import { StockMasterIngestService } from "../stockMasterIngestService.js";
import type { StockMaster } from "../../../../domain/index.js";
import type { StockMasterProvider, StockMasterRepository } from "../../../port/outbound/index.js";

const master = (stockCode: string, name: string): StockMaster => ({
    stockCode,
    name,
    market: "거래소",
    listingDate: "2010-01-01",
    ipoPrice: null,
});

class FakeProvider implements StockMasterProvider {
    constructor(private series: StockMaster[]) {}
    async listStockMasters(): Promise<StockMaster[]> {
        return this.series;
    }
}

class FakeRepo implements StockMasterRepository {
    saved: StockMaster[] = [];
    async saveStockMasters(masters: StockMaster[]): Promise<void> {
        this.saved.push(...masters);
    }
    async updateIpoPrice(): Promise<void> {}
    async getByStockCodes(): Promise<StockMaster[]> {
        return [];
    }
}

describe("ingestStockMasters", () => {
    it("provider 유니버스를 repo 에 적재하고 fresh 코드 리스트를 돌려준다", async () => {
        const provider = new FakeProvider([master("005930", "삼성전자"), master("000660", "SK하이닉스")]);
        const repo = new FakeRepo();
        const service = new StockMasterIngestService({ provider, repository: repo });

        const r = await service.ingestStockMasters();

        expect(r.saved).toBe(2);
        expect(r.stockCodes).toEqual(["005930", "000660"]); // DB 아니라 fresh 소스 순서 그대로
        expect(repo.saved).toHaveLength(2);
    });

    it("빈 유니버스도 안전(코드 0개)", async () => {
        const service = new StockMasterIngestService({
            provider: new FakeProvider([]),
            repository: new FakeRepo(),
        });
        const r = await service.ingestStockMasters();
        expect(r).toEqual({ saved: 0, stockCodes: [] });
    });
});
