import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetAllTables, type TestDb } from "../../test-support/testDb";
import { seedStock, buildDailyRow } from "../../test-support/marketSeed";
import {
  saveDailyCandles,
  findDailyCandleByStockAndDate,
  findRecentDailyCandlesByCodes,
} from "../daily-candle.repository";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetAllTables(h.db);
  await seedStock(h.db, { stockCode: CODE });
});

const CODE = "005930";

describe("saveDailyCandles", () => {
  it("(date,code) 충돌 시 갱신(upsert)한다", async () => {
    await saveDailyCandles(h.db, [buildDailyRow(CODE, "2026-05-27", { closeKrx: "1000" })]);
    await saveDailyCandles(h.db, [buildDailyRow(CODE, "2026-05-27", { closeKrx: "2000" })]);

    const map = await findRecentDailyCandlesByCodes(h.db, { stockCodes: [CODE], tradeDate: "2026-05-27", lookback: 10 });
    const rows = map.get(CODE)!;
    expect(rows).toHaveLength(1); // 새 행이 아니라 갱신
    expect(rows[0].closeKrx).toBe("2000"); // numeric(18,0) → 소수 없음
  });

  it("빈 배열이면 아무 것도 안 한다", async () => {
    await expect(saveDailyCandles(h.db, [])).resolves.toBeUndefined();
  });
});

describe("findDailyCandleByStockAndDate", () => {
  it("존재하면 id·prevClose 를, 없으면 undefined", async () => {
    await saveDailyCandles(h.db, [buildDailyRow(CODE, "2026-05-27", { prevCloseKrx: "900", prevCloseNxt: "950" })]);
    const found = await findDailyCandleByStockAndDate(h.db, { stockCode: CODE, tradeDate: "2026-05-27" });
    expect(found?.prevCloseKrx).toBe("900");
    expect(found?.prevCloseNxt).toBe("950");

    const missing = await findDailyCandleByStockAndDate(h.db, { stockCode: CODE, tradeDate: "2000-01-01" });
    expect(missing).toBeUndefined();
  });
});

describe("findRecentDailyCandlesByCodes", () => {
  it("tradeDate 이하에서 최근 N개를 tradeTime ASC 로 반환한다", async () => {
    await saveDailyCandles(h.db, [
      buildDailyRow(CODE, "2026-05-25"),
      buildDailyRow(CODE, "2026-05-26"),
      buildDailyRow(CODE, "2026-05-27"),
      buildDailyRow(CODE, "2026-05-28"), // 미래(기준일 이후) → 제외
    ]);

    const map = await findRecentDailyCandlesByCodes(h.db, { stockCodes: [CODE], tradeDate: "2026-05-27", lookback: 2 });
    const rows = map.get(CODE)!;
    // 최근 2개(25 제외) + ASC 정렬 + 28(미래) 제외
    expect(rows.map((r) => r.tradeDate)).toEqual(["2026-05-26", "2026-05-27"]);
  });

  it("빈 코드 목록이면 빈 Map", async () => {
    const map = await findRecentDailyCandlesByCodes(h.db, { stockCodes: [], tradeDate: "2026-05-27", lookback: 5 });
    expect(map.size).toBe(0);
  });
});
