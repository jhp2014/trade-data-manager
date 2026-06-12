import { describe, expect, it } from "vitest";
import { buildConflictUpdateSet } from "../_helpers";
import { reviewTargets } from "../../schema/review";

describe("buildConflictUpdateSet", () => {
  it("excludeKeys 를 제외한 컬럼만 SET 에 넣고 updatedAt 을 포함한다", () => {
    const set = buildConflictUpdateSet(reviewTargets, ["id", "stockCode", "tradeDate"]);
    const keys = Object.keys(set);

    // 충돌 키(PK/유니크 키)는 갱신 대상에서 제외.
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("stockCode");
    expect(keys).not.toContain("tradeDate");

    // 나머지 컬럼 + updatedAt 은 갱신.
    expect(keys).toContain("stockName");
    expect(keys).toContain("lineTargets");
    expect(keys).toContain("updatedAt");
  });

  it("excludeKeys 가 없으면 모든 컬럼을 SET 에 넣는다", () => {
    const set = buildConflictUpdateSet(reviewTargets);
    expect(Object.keys(set)).toContain("id");
    expect(Object.keys(set)).toContain("stockName");
  });
});
