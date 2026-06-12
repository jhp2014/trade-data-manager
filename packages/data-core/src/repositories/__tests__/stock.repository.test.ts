import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetAllTables, type TestDb } from "../../test-support/testDb";
import {
  saveStock,
  findStockByCode,
  findStocksByCodes,
  findStocksMapByCodes,
} from "../stock.repository";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetAllTables(h.db);
});

describe("saveStock / findStockByCode", () => {
  it("upsert 후 조회되고, 같은 코드 재저장 시 갱신된다", async () => {
    await saveStock(h.db, { stockCode: "005930", stockName: "삼성전자" });
    expect((await findStockByCode(h.db, { stockCode: "005930" }))?.stockName).toBe("삼성전자");

    await saveStock(h.db, { stockCode: "005930", stockName: "삼성전자우" });
    expect((await findStockByCode(h.db, { stockCode: "005930" }))?.stockName).toBe("삼성전자우");
  });
});

describe("findStocksByCodes / findStocksMapByCodes", () => {
  it("빈 코드 목록이면 빈 결과", async () => {
    expect(await findStocksByCodes(h.db, { stockCodes: [] })).toEqual([]);
    expect((await findStocksMapByCodes(h.db, { stockCodes: [] })).size).toBe(0);
  });

  it("코드→Stock 맵으로 반환한다", async () => {
    await saveStock(h.db, { stockCode: "005930", stockName: "삼성전자" });
    await saveStock(h.db, { stockCode: "000660", stockName: "SK하이닉스" });

    const map = await findStocksMapByCodes(h.db, { stockCodes: ["005930", "000660", "999999"] });
    expect(map.get("005930")?.stockName).toBe("삼성전자");
    expect(map.get("000660")?.stockName).toBe("SK하이닉스");
    expect(map.has("999999")).toBe(false); // 미존재 코드는 없음
  });
});
