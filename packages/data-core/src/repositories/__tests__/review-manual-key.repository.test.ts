import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetReviewTables, type TestDb } from "../../test-support/testDb";
import { addManualKey, listManualKeys } from "../review-manual-key.repository";

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
