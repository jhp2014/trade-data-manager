import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  resetReviewTables,
  seedPoint,
  seedTarget,
  type TestDb,
} from "../../test-support/testDb";
import {
  addManualKey,
  listManualKeys,
} from "../review-manual-key.repository";
import {
  renameManualKey,
  deleteManualKey,
  backfillManualKeysFromPayloads,
} from "../../services/review-manual-key.service";
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

async function payloadAt(time: string): Promise<Record<string, string | string[]>> {
  const [target] = await findReviewLoadTargets(h.db, { keys: [{ stockCode: CODE, tradeDate: DATE }] });
  return target?.points.find((p) => p.tradeTime === time)?.payload ?? {};
}

describe("addManualKey / listManualKeys", () => {
  it("멱등 추가 + sortOrder 증가 순으로 정렬", async () => {
    await addManualKey(h.db, { key: "result" });
    await addManualKey(h.db, { key: "tag" });
    await addManualKey(h.db, { key: "result" }); // 중복 → 무시

    const keys = await listManualKeys(h.db);
    expect(keys.map((k) => k.key)).toEqual(["result", "tag"]);
    expect(keys[0].sortOrder).toBeLessThan(keys[1].sortOrder);
  });
});

describe("renameManualKey", () => {
  beforeEach(async () => {
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
  });

  it("레지스트리 키와 모든 payload 의 키를 from→to 로 옮긴다(값 유지)", async () => {
    await addManualKey(h.db, { key: "result" });
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { result: "good" } });

    await renameManualKey(h.db, { from: "result", to: "outcome" });

    // 상태 검증(PGlite 는 execute rowCount 미제공 → 카운트 대신 상태로 확인)
    expect((await listManualKeys(h.db)).map((k) => k.key)).toEqual(["outcome"]);
    expect(await payloadAt("09:12:00")).toEqual({ outcome: "good" });
  });

  it("to 가 이미 존재하면 에러", async () => {
    await addManualKey(h.db, { key: "a" });
    await addManualKey(h.db, { key: "b" });
    await expect(renameManualKey(h.db, { from: "a", to: "b" })).rejects.toThrow(/이미 존재/);
  });
});

describe("deleteManualKey", () => {
  it("레지스트리와 모든 payload 에서 해당 키를 제거하고 다른 키는 보존한다", async () => {
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
    await addManualKey(h.db, { key: "tag" });
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { tag: "x", result: "good" } });

    await deleteManualKey(h.db, "tag");

    expect((await listManualKeys(h.db)).map((k) => k.key)).toEqual([]);
    expect(await payloadAt("09:12:00")).toEqual({ result: "good" });
  });
});

describe("backfillManualKeysFromPayloads", () => {
  it("payload 에만 있던 키를 레지스트리에 등록하고(정렬) 멱등하다", async () => {
    await seedTarget(h.db, { stockCode: CODE, tradeDate: DATE });
    await seedPoint(h.db, { stockCode: CODE, tradeDate: DATE, tradeTime: "09:12:00", payload: { tag: "x", result: "good" } });
    await addManualKey(h.db, { key: "result" }); // 이미 등록된 키는 건너뜀

    const added = await backfillManualKeysFromPayloads(h.db);
    expect(added).toEqual(["tag"]); // result 는 이미 있으므로 tag 만

    const again = await backfillManualKeysFromPayloads(h.db);
    expect(again).toEqual([]); // 멱등
  });
});
