import { describe, expect, it } from "vitest";
import { buildManualSummary } from "@/lib/manualSummary";

describe("buildManualSummary", () => {
  it("채워진/전체 개수와 미입력 키, preview 를 계산한다", () => {
    const summary = buildManualSummary({
      entryType: "breakout",
      reason: "   ", // 공백만 → 미입력
      memo: "ok",
      extra: "x",
    });

    expect(summary.totalCount).toBe(4);
    expect(summary.filledCount).toBe(3); // reason 제외
    expect(summary.missingRequired).toEqual(["reason"]);
    expect(summary.preview).toEqual({
      entryType: "breakout",
      reason: null, // 공백 → null
      memo: "ok",
      reviewDone: null, // 키 자체가 없음 → null
    });
  });

  it("빈 manual 은 0/0", () => {
    const summary = buildManualSummary({});
    expect(summary.filledCount).toBe(0);
    expect(summary.totalCount).toBe(0);
    expect(summary.missingRequired).toEqual([]);
  });
});
