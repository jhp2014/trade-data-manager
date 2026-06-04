import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewCommands } from "@/lib/reviewCommands";
import { useReviewStore } from "@/stores/useReviewStore";
import type { ReviewStockGroup } from "@/types/review";

function group(stockCode: string, pointKeys: string[]): ReviewStockGroup {
  return {
    groupKey: `${stockCode}|2026-05-27`,
    stockCode,
    stockName: stockCode,
    tradeDate: "2026-05-27",
    points: pointKeys.map((pointKey, i) => ({
      pointKey,
      tradeTime: `09:${String(10 + i).padStart(2, "0")}`,
      rowNumber: i + 1,
      reviewId: pointKey,
      manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
      sourceRow: {
        reviewId: pointKey,
        rowNumber: i + 1,
        stockCode,
        stockName: stockCode,
        tradeDate: "2026-05-27",
        tradeTime: `09:${String(10 + i).padStart(2, "0")}`,
        features: {},
        manual: {},
      },
    })),
  };
}

const groups = [
  group("000001", ["a1", "a2"]),
  group("000002", ["b1"]),
  group("000003", ["c1"]),
];

describe("createReviewCommands", () => {
  const replaceState = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("window", { history: { replaceState } });
    replaceState.mockClear();
    useReviewStore.setState({
      selectedGroupIndex: 0,
      selectedPointKey: "a1",
      viewMode: "summary",
      chartOverride: null,
      history: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves between points within the current group and mirrors the URL", () => {
    const commands = createReviewCommands(groups);

    commands.nextPoint();
    expect(useReviewStore.getState().selectedPointKey).toBe("a2");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/review/000001/2026-05-27/09:11");

    commands.prevPoint();
    expect(useReviewStore.getState().selectedPointKey).toBe("a1");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/review/000001/2026-05-27/09:10");
  });

  it("moves groups using the navigable index list", () => {
    useReviewStore.setState({ selectedGroupIndex: 0, selectedPointKey: "a1" });
    const commands = createReviewCommands(groups, [0, 2]);

    commands.nextGroup();
    expect(useReviewStore.getState().selectedGroupIndex).toBe(2);
    expect(useReviewStore.getState().selectedPointKey).toBe("c1");

    commands.prevGroup();
    expect(useReviewStore.getState().selectedGroupIndex).toBe(0);
    expect(useReviewStore.getState().selectedPointKey).toBe("a1");
  });

  it("snaps to the nearest navigable group when current group is outside the filtered order", () => {
    useReviewStore.setState({ selectedGroupIndex: 1, selectedPointKey: "b1" });
    const commands = createReviewCommands(groups, [0, 2]);

    commands.nextGroup();
    expect(useReviewStore.getState().selectedGroupIndex).toBe(2);

    useReviewStore.setState({ selectedGroupIndex: 1, selectedPointKey: "b1" });
    commands.prevGroup();
    expect(useReviewStore.getState().selectedGroupIndex).toBe(0);
  });

  it("ignores invalid goToGroup indices", () => {
    const commands = createReviewCommands(groups);

    commands.goToGroup(99);
    expect(useReviewStore.getState().selectedGroupIndex).toBe(0);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
