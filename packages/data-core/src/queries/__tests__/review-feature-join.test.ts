import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  resetAllTables,
  seedPoint,
  seedTarget,
  type TestDb,
} from "../../test-support/testDb";
import {
  seedStock,
  seedDailyCandle,
  seedMinuteCandle,
  seedFeature,
} from "../../test-support/marketSeed";
import { findReviewLoadTargets } from "../review-load.query";
import { findReviewExportRows } from "../review-export.query";

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
const CODE = "005930";
const TIME = "09:12:00";

/** (code,date,time) 좌표에 stock→daily→minute→feature 체인을 깔고 review 타깃/포인트를 만든다. */
async function seedFullCoordinate() {
  await seedStock(h.db, { stockCode: CODE, stockName: "삼성전자" });
  const dailyId = await seedDailyCandle(h.db, { stockCode: CODE, tradeDate: DATE });
  const minuteId = await seedMinuteCandle(h.db, { dailyCandleId: dailyId, stockCode: CODE, tradeDate: DATE, tradeTime: TIME });
  await seedFeature(h.db, {
    minuteCandleId: minuteId,
    dailyCandleId: dailyId,
    stockCode: CODE,
    tradeDate: DATE,
    tradeTime: TIME,
    closeRateKrx: "12.3400",
    dayHighTime: "10:05:00",
  });
  await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
  await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: TIME, payload: { result: "good" } });
}

describe("review 쿼리의 minute_candle_features 조인", () => {
  it("load 가 포인트에 featureKey(code|date|HH:MM:SS) 로 피처를 매단다", async () => {
    await seedFullCoordinate();
    const [target] = await findReviewLoadTargets(h.db, { keys: [{ stockCode: CODE, tradeDate: DATE }] });
    const features = target.points[0].features;

    expect(features.closeRateKrx).toBe("12.3400"); // numeric(8,4) → scale 보존 문자열
    expect(features.dayHighTime).toBe("10:05:00"); // time → HH:MM:SS
    expect(features.changeRate5m).toBeNull(); // 비어있는 nullable 피처는 null
  });

  it("export 도 같은 피처를 동봉한다", async () => {
    await seedFullCoordinate();
    const rows = await findReviewExportRows(h.db, { keys: [{ stockCode: CODE, tradeDate: DATE }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].features.closeRateKrx).toBe("12.3400");
  });

  it("매칭되는 피처 행이 없으면 features 는 빈 객체", async () => {
    // 캔들/피처 없이 review 타깃·포인트만.
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: TIME, payload: { result: "good" } });

    const [target] = await findReviewLoadTargets(h.db, { keys: [{ stockCode: CODE, tradeDate: DATE }] });
    expect(target.points[0].features).toEqual({});
  });
});
