import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetAllTables, type TestDb } from "../../test-support/testDb";
import { seedStock, seedDailyCandle, buildMinuteRow } from "../../test-support/marketSeed";
import {
  saveMinuteCandles,
  findDistinctStockCodesByDate,
  findMinuteCandlesByStockAndDate,
  findMinuteCandlesByCodesAndDate,
} from "../minute-candle.repository";

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

const DATE = "2026-05-27";
const A = "005930";
const B = "000660";

/** 두 종목의 daily 를 깔고 dailyCandleId 를 돌려준다. */
async function seedTwoDailies(): Promise<{ a: bigint; b: bigint }> {
  await seedStock(h.db, { stockCode: A });
  await seedStock(h.db, { stockCode: B });
  const a = await seedDailyCandle(h.db, { stockCode: A, tradeDate: DATE });
  const b = await seedDailyCandle(h.db, { stockCode: B, tradeDate: DATE });
  return { a, b };
}

describe("saveMinuteCandles", () => {
  it("(date,code,time) 충돌 시 갱신하고 tradeTime ASC 로 조회된다", async () => {
    const { a } = await seedTwoDailies();
    await saveMinuteCandles(h.db, [
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "10:30:00" }),
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "09:12:00", close: "1000" }),
    ]);
    // 같은 시각 재저장 → 갱신
    await saveMinuteCandles(h.db, [
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "09:12:00", close: "1234" }),
    ]);

    const rows = await findMinuteCandlesByStockAndDate(h.db, { stockCode: A, tradeDate: DATE });
    expect(rows.map((r) => r.tradeTime)).toEqual(["09:12:00", "10:30:00"]); // ASC
    expect(rows[0].close).toBe("1234"); // 갱신됨
  });
});

describe("findDistinctStockCodesByDate", () => {
  it("해당 날짜에 분봉이 있는 종목코드(DISTINCT)", async () => {
    const { a, b } = await seedTwoDailies();
    await saveMinuteCandles(h.db, [
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "09:12:00" }),
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "09:13:00" }),
      buildMinuteRow({ dailyCandleId: b, stockCode: B, tradeDate: DATE, tradeTime: "09:12:00" }),
    ]);
    const codes = (await findDistinctStockCodesByDate(h.db, { tradeDate: DATE })).sort();
    expect(codes).toEqual([B, A].sort());
  });
});

describe("findMinuteCandlesByCodesAndDate", () => {
  it("종목별 Map 으로 묶고 각 시리즈는 tradeTime ASC", async () => {
    const { a, b } = await seedTwoDailies();
    await saveMinuteCandles(h.db, [
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "10:00:00" }),
      buildMinuteRow({ dailyCandleId: a, stockCode: A, tradeDate: DATE, tradeTime: "09:00:00" }),
      buildMinuteRow({ dailyCandleId: b, stockCode: B, tradeDate: DATE, tradeTime: "09:30:00" }),
    ]);
    const map = await findMinuteCandlesByCodesAndDate(h.db, { stockCodes: [A, B], tradeDate: DATE });
    expect(map.get(A)!.map((r) => r.tradeTime)).toEqual(["09:00:00", "10:00:00"]);
    expect(map.get(B)!.map((r) => r.tradeTime)).toEqual(["09:30:00"]);
  });

  it("빈 코드 목록이면 빈 Map", async () => {
    const map = await findMinuteCandlesByCodesAndDate(h.db, { stockCodes: [], tradeDate: DATE });
    expect(map.size).toBe(0);
  });
});
