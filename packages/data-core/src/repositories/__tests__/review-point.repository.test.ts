import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  resetReviewTables,
  seedPoint,
  seedTarget,
  type TestDb,
} from "../../test-support/testDb";
import { deleteReviewPointById, upsertReviewPointByTargetId } from "../review-point.repository";
import { findReviewTargetIdByKey } from "../review-target.repository";
import { findReviewLoadTargets } from "../../queries/review-load.query";

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

/** 단일 타깃의 (tradeTime → payload) 현재 상태를 읽어 검증에 쓴다. */
async function readPayloads(): Promise<Record<string, Record<string, string | string[]>>> {
  const [target] = await findReviewLoadTargets(h.db, { keys: [{ stockCode: CODE, tradeDate: DATE }] });
  const out: Record<string, Record<string, string | string[]>> = {};
  for (const p of target?.points ?? []) out[p.tradeTime] = p.payload;
  return out;
}

describe("upsertReviewPointByTargetId", () => {
  it("같은 (target,time) 재호출 시 payload 를 덮어쓴다", async () => {
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
    const reviewTargetId = await findReviewTargetIdByKey(h.db, { stockCode: CODE, tradeDate: DATE });
    if (!reviewTargetId) throw new Error("seed target missing");

    const first = await upsertReviewPointByTargetId(h.db, { reviewTargetId, tradeTime: "09:12:00", payload: { result: "good" } });
    const second = await upsertReviewPointByTargetId(h.db, { reviewTargetId, tradeTime: "09:12:00", payload: { result: "bad" } });

    expect(second.id).toBe(first.id); // 같은 행 갱신
    expect((await readPayloads())["09:12:00"]).toEqual({ result: "bad" });
  });
});

describe("deleteReviewPointById", () => {
  it("id 로 포인트를 삭제한다", async () => {
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
    const id = await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { result: "good" } });

    await deleteReviewPointById(h.db, BigInt(id));
    expect(await readPayloads()).toEqual({});
  });
});

