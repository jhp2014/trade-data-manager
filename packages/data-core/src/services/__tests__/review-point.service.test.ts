import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  resetReviewTables,
  seedTarget,
  type TestDb,
} from "../../test-support/testDb";
import { findReviewLoadTargets } from "../../queries/review-load.query";
import { upsertReviewPoint } from "../review-point.service";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetReviewTables(h.db);
});

const DATE = "2026-05-27";
const CODE = "005930";

async function readPayloads(): Promise<Record<string, Record<string, string | string[]>>> {
  const [target] = await findReviewLoadTargets(h.db, { keys: [{ stockCode: CODE, tradeDate: DATE }] });
  const out: Record<string, Record<string, string | string[]>> = {};
  for (const p of target?.points ?? []) out[p.tradeTime] = p.payload;
  return out;
}

describe("upsertReviewPoint", () => {
  it("stockCode/tradeDate 로 target 을 찾아 같은 (target,time) point payload 를 덮어쓴다", async () => {
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });

    const first = await upsertReviewPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { result: "good" } });
    const second = await upsertReviewPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { result: "bad" } });

    expect(second.id).toBe(first.id);
    expect((await readPayloads())["09:12:00"]).toEqual({ result: "bad" });
  });

  it("대상 target 이 없으면 에러", async () => {
    await expect(
      upsertReviewPoint(h.db, { stockCode: "999999", tradeDate: DATE, tradeTime: "09:12:00", payload: {} }),
    ).rejects.toThrow(/review_target not found/);
  });
});
