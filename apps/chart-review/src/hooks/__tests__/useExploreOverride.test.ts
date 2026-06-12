// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { ChartOverlaySeries, ChartPreviewDTO, ChartThemeOverlay } from "@/types/chart";
import type { ReviewStockGroup } from "@/types/review";
import type { ChartOverride } from "@/stores/useReviewStore";

// useChartPreview(React Query) 를 목해 테마 번들을 고정 반환한다(앵커/디바운스 무관).
vi.mock("@/hooks/useChartPreview", () => ({ useChartPreview: vi.fn() }));
import { useChartPreview } from "@/hooks/useChartPreview";
import { useExploreOverride } from "@/hooks/useExploreOverride";

const SELF = "005930";
const PEER = "000660"; // review_target(포인트 보유)
const PEER_NT = "035720"; // review_target 아님

function overlay(p: {
  stockCode: string;
  stockName: string;
  isSelf: boolean;
  isReviewTarget: boolean;
  reviewPoints?: { reviewId: string; tradeTime: string; payload: Record<string, string | string[]> }[];
  lineTargets?: number[];
}): ChartOverlaySeries {
  return {
    stockCode: p.stockCode,
    stockName: p.stockName,
    isSelf: p.isSelf,
    series: [],
    daily: [],
    minute: [],
    lineTargets: p.lineTargets ?? [],
    reviewPoints: p.reviewPoints ?? [],
    isReviewTarget: p.isReviewTarget,
    hasReview: (p.reviewPoints?.length ?? 0) > 0,
    isListingDay: false,
    firstMinuteOpen: null,
  };
}

const themes: ChartThemeOverlay[] = [
  {
    themeId: "t1",
    themeName: "반도체",
    overlaySeries: [
      overlay({ stockCode: SELF, stockName: "삼성전자", isSelf: true, isReviewTarget: true }),
      overlay({
        stockCode: PEER,
        stockName: "SK하이닉스",
        isSelf: false,
        isReviewTarget: true,
        lineTargets: [9010],
        reviewPoints: [{ reviewId: "p1", tradeTime: "09:05:00", payload: { result: "good" } }],
      }),
      overlay({ stockCode: PEER_NT, stockName: "카카오", isSelf: false, isReviewTarget: false }),
    ],
  },
];

const selfGroup: ReviewStockGroup = {
  groupKey: `${SELF}|2026-05-27`,
  stockCode: SELF,
  stockName: "삼성전자",
  tradeDate: "2026-05-27",
  points: [
    {
      pointKey: `${SELF}-09:12`,
      tradeTime: "09:12",
      rowNumber: 1,
      reviewId: "s1",
      manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
      sourceRow: {
        reviewId: "s1",
        rowNumber: 1,
        stockCode: SELF,
        stockName: "삼성전자",
        tradeDate: "2026-05-27",
        tradeTime: "09:12",
        features: {},
        manual: {},
      },
    },
  ],
} as ReviewStockGroup;

function paramsWith(chartOverride: ChartOverride | null) {
  return {
    chartOverride,
    groups: [selfGroup],
    selectedGroup: selfGroup,
    selectedGroupIndex: 0,
    selectedPoint: selfGroup.points[0],
    filterActive: false,
    navigableIndices: [0],
    patchHistory: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(useChartPreview).mockReturnValue({
    data: { themes, daily: [], minute: [], prevCloseKrx: null, prevCloseNxt: null, isListingDay: false } satisfies ChartPreviewDTO,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useChartPreview>);
});
afterEach(() => cleanup());

describe("useExploreOverride", () => {
  it("override 없으면 작업셋 선택 종목을 본다", () => {
    const { result } = renderHook(() => useExploreOverride(paramsWith(null)));
    expect(result.current.isOverride).toBe(false);
    expect(result.current.effectiveStock.stockCode).toBe(SELF);
    expect(result.current.activeGroup).toBe(selfGroup);
    expect(result.current.activePoint).toBe(selfGroup.points[0]);
    expect(result.current.activeReview).toBeNull();
    expect(result.current.canInput).toBe(true);
    expect(result.current.navPosition).toBe(0);
    expect(result.current.navCount).toBe(1);
  });

  it("review_target peer 로 override 하면 그 종목의 번들 review 를 활성 그룹으로 쓴다", () => {
    const { result } = renderHook(() =>
      useExploreOverride(paramsWith({ stockCode: PEER, tradeDate: "2026-05-27", stockName: "SK하이닉스" })),
    );
    expect(result.current.isOverride).toBe(true);
    expect(result.current.effectiveStock.stockCode).toBe(PEER);
    expect(result.current.activeReview?.stockCode).toBe(PEER); // 번들에서 찾음
    expect(result.current.activeGroup.stockCode).toBe(PEER);
    expect(result.current.activeGroup.points.map((p) => p.tradeTime)).toEqual(["09:05"]);
    expect(result.current.canInput).toBe(true); // peer 가 review_target
    expect(result.current.navPosition).toBe(-1); // 작업셋 밖
  });

  it("review_target 아닌 peer 로 override 하면 입력 불가", () => {
    const { result } = renderHook(() =>
      useExploreOverride(paramsWith({ stockCode: PEER_NT, tradeDate: "2026-05-27", stockName: "카카오" })),
    );
    expect(result.current.isOverride).toBe(true);
    expect(result.current.canInput).toBe(false);
    expect(result.current.activeReview?.isReviewTarget).toBe(false);
  });
});
