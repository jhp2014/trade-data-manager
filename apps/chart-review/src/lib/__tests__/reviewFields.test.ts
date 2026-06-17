import { describe, expect, it } from "vitest";
import {
  parseGroupId,
  parseCaseId,
  parseLineTargets,
  resolveFieldValue,
  collectFieldKeys,
  collectValueSuggestions,
  formatPointTime,
} from "@/lib/reviewFields";
import type { ReviewPoint, ReviewStockGroup } from "@/types/review";

/** resolveFieldValue/collect* 가 보는 필드만 채운 최소 ReviewPoint. */
function makePoint(p: {
  stockCode?: string;
  tradeDate?: string;
  stockName?: string;
  tradeTime?: string;
  manual?: Record<string, string>;
  features?: Record<string, string>;
}): ReviewPoint {
  return {
    tradeTime: p.tradeTime ?? "",
    sourceRow: {
      stockCode: p.stockCode ?? "",
      tradeDate: p.tradeDate ?? "",
      stockName: p.stockName ?? "",
      manual: p.manual ?? {},
      features: p.features ?? {},
    },
  } as unknown as ReviewPoint;
}

function makeGroup(points: ReviewPoint[]): ReviewStockGroup {
  return { points } as unknown as ReviewStockGroup;
}

describe("parseGroupId", () => {
  it("여러 구분자 형식을 관대하게 파싱하고 코드를 대문자화", () => {
    expect(parseGroupId("005930-2026-05-27")).toEqual({ code: "005930", date: "2026-05-27" });
    expect(parseGroupId("0126z0 20260527")).toEqual({ code: "0126Z0", date: "2026-05-27" });
  });
  it("형식이 안 맞으면 null", () => {
    expect(parseGroupId("hello")).toBeNull();
    expect(parseGroupId("")).toBeNull();
  });
});

describe("parseCaseId", () => {
  it("GroupId + 시각(HHmm)을 파싱하고 코드를 대문자화", () => {
    expect(parseCaseId("036570-2026-06-02-1035")).toEqual({
      code: "036570",
      date: "2026-06-02",
      time: "10:35",
    });
    expect(parseCaseId("0126z0 20260602 1035")).toEqual({
      code: "0126Z0",
      date: "2026-06-02",
      time: "10:35",
    });
    expect(parseCaseId("036570-2026-06-02-10:35")).toEqual({
      code: "036570",
      date: "2026-06-02",
      time: "10:35",
    });
  });
  it("시각이 없으면 time 은 null (GroupId 형태도 수용)", () => {
    expect(parseCaseId("005930-2026-05-27")).toEqual({
      code: "005930",
      date: "2026-05-27",
      time: null,
    });
  });
  it("시각이 무효(24시/60분 이상)면 time 은 null", () => {
    expect(parseCaseId("036570-2026-06-02-2599")?.time).toBeNull();
  });
  it("형식이 안 맞으면 null", () => {
    expect(parseCaseId("hello")).toBeNull();
    expect(parseCaseId("")).toBeNull();
  });
});

describe("parseLineTargets", () => {
  it("파이프 구분 양수 가격만 남긴다", () => {
    expect(parseLineTargets("9010 | 9450")).toEqual([9010, 9450]);
  });
  it("0/음수/비숫자는 제외", () => {
    expect(parseLineTargets("0 | -5 | abc | 100")).toEqual([100]);
  });
  it("undefined → 빈 배열", () => {
    expect(parseLineTargets(undefined)).toEqual([]);
  });
});

describe("resolveFieldValue", () => {
  const point = makePoint({
    stockCode: "005930",
    tradeDate: "2026-05-27",
    stockName: "삼성전자",
    tradeTime: "09:12:00",
    manual: { result: " good " },
    features: { closeRateKrx: " 12.34 " },
  });

  it("고정 필드", () => {
    expect(resolveFieldValue("stockCode", point)).toBe("005930");
    expect(resolveFieldValue("tradeTime", point)).toBe("09:12"); // HH:MM 으로 자름
    expect(resolveFieldValue("groupId", point)).toBe("005930-2026-05-27");
    expect(resolveFieldValue("caseId", point)).toBe("005930-2026-05-27-0912"); // GroupId + HHmm
  });
  it("caseId 는 타점 시각이 없으면 GroupId 형태로 fallback", () => {
    const noTime = makePoint({ stockCode: "005930", tradeDate: "2026-05-27", tradeTime: "" });
    expect(resolveFieldValue("caseId", noTime)).toBe("005930-2026-05-27");
  });
  it("m_ 키는 manual 에서, trim 적용", () => {
    expect(resolveFieldValue("m_result", point)).toBe("good");
  });
  it("그 외 키는 feature 에서, trim 적용", () => {
    expect(resolveFieldValue("closeRateKrx", point)).toBe("12.34");
  });
  it("없는 키는 빈 문자열", () => {
    expect(resolveFieldValue("m_missing", point)).toBe("");
    expect(resolveFieldValue("unknownFeature", point)).toBe("");
  });
});

describe("collectFieldKeys", () => {
  it("manual 은 m_ 접두로, feature 는 amountText 제외 후 정렬 수집", () => {
    const groups = [
      makeGroup([
        makePoint({ manual: { result: "good" }, features: { closeRateKrx: "1", amountText: "x" } }),
        makePoint({ manual: { tag: "a" }, features: { dayHighRate: "2" } }),
      ]),
    ];
    const { manualFieldKeys, featureFieldKeys } = collectFieldKeys(groups);
    expect(manualFieldKeys).toEqual(["m_result", "m_tag"]);
    expect(featureFieldKeys).toEqual(["closeRateKrx", "dayHighRate"]); // amountText 제외
  });
});

describe("collectValueSuggestions", () => {
  it("키별 distinct 값을 ' | ' 분해해 정렬 수집", () => {
    const groups = [
      makeGroup([
        makePoint({ manual: { tag: "breakout | volume" } }),
        makePoint({ manual: { tag: "volume | gap" } }),
      ]),
    ];
    expect(collectValueSuggestions(groups)).toEqual({ tag: ["breakout", "gap", "volume"] });
  });
});

describe("formatPointTime", () => {
  it("빈 값이면 '미입력'", () => {
    expect(formatPointTime("")).toBe("미입력");
    expect(formatPointTime("09:12")).toBe("09:12");
  });
});
