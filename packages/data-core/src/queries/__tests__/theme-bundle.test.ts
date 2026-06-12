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
  seedTheme,
  seedThemeMapping,
} from "../../test-support/marketSeed";
import { getThemeBundle } from "../theme-bundle";

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
const SELF = "005930";
const PEER = "000660";
const TIME = "09:12:00";

describe("getThemeBundle", () => {
  it("테마 멤버를 self 먼저로 묶고, 멤버별 daily/minute/features/review 를 동봉한다", async () => {
    await seedStock(h.db, { stockCode: SELF, stockName: "삼성전자" });
    await seedStock(h.db, { stockCode: PEER, stockName: "SK하이닉스" });
    const dSelf = await seedDailyCandle(h.db, { stockCode: SELF, tradeDate: DATE });
    const dPeer = await seedDailyCandle(h.db, { stockCode: PEER, tradeDate: DATE });

    const themeId = await seedTheme(h.db, "반도체");
    await seedThemeMapping(h.db, themeId, dSelf);
    await seedThemeMapping(h.db, themeId, dPeer);

    const mSelf = await seedMinuteCandle(h.db, { dailyCandleId: dSelf, stockCode: SELF, tradeDate: DATE, tradeTime: TIME });
    await seedMinuteCandle(h.db, { dailyCandleId: dPeer, stockCode: PEER, tradeDate: DATE, tradeTime: TIME });
    await seedFeature(h.db, { minuteCandleId: mSelf, dailyCandleId: dSelf, stockCode: SELF, tradeDate: DATE, tradeTime: TIME });

    // review 는 self 에만.
    await seedTarget(h.db, { stockCode: SELF, tradeDate: DATE });
    await seedPoint(h.db, { stockCode: SELF, tradeDate: DATE, tradeTime: TIME, payload: { result: "good" } });

    const bundles = await getThemeBundle(h.db, { stockCode: SELF, tradeDate: DATE });
    expect(bundles).toHaveLength(1);

    const bundle = bundles[0];
    expect(bundle.themeName).toBe("반도체");
    expect(bundle.members.map((m) => m.stockCode)).toEqual([SELF, PEER]); // self 먼저

    const [self, peer] = bundle.members;
    expect(self.isSelf).toBe(true);
    expect(self.stockName).toBe("삼성전자");
    expect(self.daily.length).toBeGreaterThan(0);
    expect(self.minute).toHaveLength(1);
    expect(self.features).toHaveLength(1);
    expect(self.review?.points.map((p) => p.tradeTime)).toEqual([TIME]);
    expect(self.isListingDay).toBe(false);

    expect(peer.isSelf).toBe(false);
    expect(peer.review).toBeNull(); // peer 는 review_target 아님
  });

  it("테마 매핑이 없으면 invariant 위반으로 throw 한다", async () => {
    await seedStock(h.db, { stockCode: SELF, stockName: "삼성전자" });
    await seedDailyCandle(h.db, { stockCode: SELF, tradeDate: DATE }); // daily 는 있으나 테마 매핑 없음

    await expect(getThemeBundle(h.db, { stockCode: SELF, tradeDate: DATE })).rejects.toThrow(/theme/i);
  });
});
