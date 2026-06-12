import { describe, expect, it } from "vitest";
import {
  splitManualValue,
  joinManualValue,
  flattenManualPayload,
  stripManualPrefix,
  MANUAL_VALUE_SEP,
} from "@/lib/manualValue";

describe("splitManualValue", () => {
  it("파이프로 분해하고 공백/빈 토큰을 제거한다", () => {
    expect(splitManualValue("a | b |  | c ")).toEqual(["a", "b", "c"]);
  });
  it("undefined/빈 문자열은 빈 배열", () => {
    expect(splitManualValue(undefined)).toEqual([]);
    expect(splitManualValue("")).toEqual([]);
    expect(splitManualValue("  ")).toEqual([]);
  });
  it("단일 값", () => {
    expect(splitManualValue("good")).toEqual(["good"]);
  });
});

describe("joinManualValue", () => {
  it("배열은 ' | ' 로 합치고 문자열은 그대로", () => {
    expect(joinManualValue(["a", "b"])).toBe(`a${MANUAL_VALUE_SEP}b`);
    expect(joinManualValue("good")).toBe("good");
  });
});

describe("split ∘ join 라운드트립", () => {
  it("배열 → 문자열 → 배열 이 보존된다", () => {
    const arr = ["breakout", "volume", "gap"];
    expect(splitManualValue(joinManualValue(arr))).toEqual(arr);
  });
});

describe("flattenManualPayload", () => {
  it("payload(string|string[]) 를 manual(string) 레코드로 변환", () => {
    expect(flattenManualPayload({ result: "good", tag: ["a", "b"] })).toEqual({
      result: "good",
      tag: "a | b",
    });
  });
});

describe("stripManualPrefix", () => {
  it("m_ 접두사를 떼고, 없으면 그대로", () => {
    expect(stripManualPrefix("m_result")).toBe("result");
    expect(stripManualPrefix("result")).toBe("result");
    expect(stripManualPrefix("m_")).toBe("");
  });
});
