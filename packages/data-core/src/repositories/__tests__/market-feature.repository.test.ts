import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetAllTables, type TestDb } from "../../test-support/testDb";
import {
  seedStock,
  seedDailyCandle,
  seedMinuteCandle,
  buildFeatureRow,
} from "../../test-support/marketSeed";
import {
  saveMinuteFeatures,
  findFeaturesByCodesAndDate,
  findAllTradeDates,
  findPendingTradeDates,
} from "../market-feature.repository";

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

/** stock+daily+minute 체인을 깔고 buildFeatureRow 에 바로 스프레드할 키로 돌려준다. */
async function seedChain(tradeTime: string, date = DATE, code = CODE) {
  await seedStock(h.db, { stockCode: code });
  const dailyCandleId = await seedDailyCandle(h.db, { stockCode: code, tradeDate: date });
  const minuteCandleId = await seedMinuteCandle(h.db, { dailyCandleId, stockCode: code, tradeDate: date, tradeTime });
  return { dailyCandleId, minuteCandleId };
}

describe("saveMinuteFeatures", () => {
  it("minuteCandleId 충돌 시 갱신한다", async () => {
    const ids = await seedChain("09:12:00");
    await saveMinuteFeatures(h.db, [buildFeatureRow({ ...ids, stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", closeRateKrx: "1.0000" })]);
    await saveMinuteFeatures(h.db, [buildFeatureRow({ ...ids, stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", closeRateKrx: "9.9900" })]);

    const map = await findFeaturesByCodesAndDate(h.db, { stockCodes: [CODE], tradeDate: DATE });
    expect(map.get(CODE)).toHaveLength(1); // 갱신(새 행 아님)
    // 동적 계산기 컬럼은 select 타입에 정적으로 안 잡혀 Record 로 캐스팅해 읽는다.
    const row = map.get(CODE)![0] as Record<string, unknown>;
    expect(row.closeRateKrx).toBe("9.9900");
  });

  it("CHUNK_SIZE(500) 를 넘는 행도 모두 적재한다", async () => {
    await seedStock(h.db, { stockCode: CODE });
    const dailyId = await seedDailyCandle(h.db, { stockCode: CODE, tradeDate: DATE });

    const N = 501;
    const rows = [];
    for (let i = 0; i < N; i++) {
      const tradeTime = `${String(9 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`;
      const minuteId = await seedMinuteCandle(h.db, { dailyCandleId: dailyId, stockCode: CODE, tradeDate: DATE, tradeTime, unixTimestamp: i });
      rows.push(buildFeatureRow({ minuteCandleId: minuteId, dailyCandleId: dailyId, stockCode: CODE, tradeDate: DATE, tradeTime }));
    }
    await saveMinuteFeatures(h.db, rows);

    const map = await findFeaturesByCodesAndDate(h.db, { stockCodes: [CODE], tradeDate: DATE });
    expect(map.get(CODE)).toHaveLength(N);
  });

  it("빈 배열이면 아무 것도 안 한다", async () => {
    await expect(saveMinuteFeatures(h.db, [])).resolves.toBeUndefined();
  });
});

describe("findFeaturesByCodesAndDate", () => {
  it("종목별 Map 으로 묶고 tradeTime ASC", async () => {
    // 같은 종목/날짜의 한 daily 아래 두 분봉 + 두 피처.
    await seedStock(h.db, { stockCode: CODE });
    const dailyCandleId = await seedDailyCandle(h.db, { stockCode: CODE, tradeDate: DATE });
    const m1 = await seedMinuteCandle(h.db, { dailyCandleId, stockCode: CODE, tradeDate: DATE, tradeTime: "10:00:00" });
    const m2 = await seedMinuteCandle(h.db, { dailyCandleId, stockCode: CODE, tradeDate: DATE, tradeTime: "09:00:00", unixTimestamp: 1 });
    await saveMinuteFeatures(h.db, [
      buildFeatureRow({ minuteCandleId: m1, dailyCandleId, stockCode: CODE, tradeDate: DATE, tradeTime: "10:00:00" }),
      buildFeatureRow({ minuteCandleId: m2, dailyCandleId, stockCode: CODE, tradeDate: DATE, tradeTime: "09:00:00" }),
    ]);

    const map = await findFeaturesByCodesAndDate(h.db, { stockCodes: [CODE], tradeDate: DATE });
    expect(map.get(CODE)!.map((r) => r.tradeTime)).toEqual(["09:00:00", "10:00:00"]);
  });
});

describe("findAllTradeDates / findPendingTradeDates", () => {
  it("findAllTradeDates 는 분봉 거래일을 DISTINCT ASC 로", async () => {
    const c1 = await seedChain("09:00:00", "2026-05-26");
    void c1;
    await seedChain("09:00:00", "2026-05-27");
    expect(await findAllTradeDates(h.db)).toEqual(["2026-05-26", "2026-05-27"]);
  });

  it("findPendingTradeDates 는 피처가 없는 분봉이 있는 거래일만", async () => {
    // D1: 분봉 + 피처(완료)
    const d1 = await seedChain("09:00:00", "2026-05-26");
    await saveMinuteFeatures(h.db, [buildFeatureRow({ ...d1, stockCode: CODE, tradeDate: "2026-05-26", tradeTime: "09:00:00" })]);
    // D2: 분봉만(피처 없음 → pending)
    await seedChain("09:00:00", "2026-05-27");

    expect(await findPendingTradeDates(h.db)).toEqual(["2026-05-27"]);
  });
});
