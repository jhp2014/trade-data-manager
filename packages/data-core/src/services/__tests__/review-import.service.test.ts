import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  resetReviewTables,
  seedPoint,
  seedTarget,
  type TestDb,
} from "../../test-support/testDb";
import { mergeReviewPointPayloads } from "../review-import.service";
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
  await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
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

describe("mergeReviewPointPayloads", () => {
  it("좌표(code+date+time)로 식별해 비어있지 않은 값만 병합하고 기존 키는 보존한다", async () => {
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { result: "good" } });

    const report = await mergeReviewPointPayloads(h.db, [
      { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12", values: { tag: "breakout" }, ref: "r1" },
    ]);

    expect(report.merged).toBe(1);
    // result(기존) 보존 + tag(신규) 병합. 빈 셀 삭제 없음.
    expect((await readPayloads())["09:12:00"]).toEqual({ result: "good", tag: "breakout" });
  });

  it("reviewId 로 우선 식별한다", async () => {
    const id = await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: {} });
    const report = await mergeReviewPointPayloads(h.db, [
      { reviewId: id, values: { result: "good" }, ref: "r1" },
    ]);
    expect(report.merged).toBe(1);
    expect((await readPayloads())["09:12:00"]).toEqual({ result: "good" });
  });

  it("값이 없으면 skippedNoValues, 식별 실패면 skippedNotFound 로 보고하고 건너뛴다", async () => {
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: {} });

    const report = await mergeReviewPointPayloads(h.db, [
      { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12", values: {}, ref: "empty" },
      { stockCode: CODE, tradeDate: DATE, tradeTime: "23:59", values: { result: "x" }, ref: "missing" },
    ]);

    expect(report.merged).toBe(0);
    expect(report.skippedNoValues).toEqual(["empty"]);
    expect(report.skippedNotFound).toEqual(["missing"]);
  });

  it("병합 도중 실패하면 앞선 payload 업데이트도 rollback 한다", async () => {
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: {} });
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:13:00", payload: {} });

    await expect(
      mergeReviewPointPayloads(h.db, [
        { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12", values: { result: "good" }, ref: "ok" },
        {
          stockCode: CODE,
          tradeDate: DATE,
          tradeTime: "09:13",
          values: { broken: BigInt(1) } as unknown as Record<string, string | string[]>,
          ref: "broken",
        },
      ]),
    ).rejects.toThrow(/serialize a BigInt/);

    expect((await readPayloads())["09:12:00"]).toEqual({});
    expect((await readPayloads())["09:13:00"]).toEqual({});
  });
});
