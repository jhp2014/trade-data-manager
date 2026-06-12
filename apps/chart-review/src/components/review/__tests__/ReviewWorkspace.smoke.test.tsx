// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InitialReviewSelection, ReviewStockGroup } from "@/types/review";

// ── 무거운/외부 의존 목 (차트 캔버스·라우터·차트 preview·네트워크) ──────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/useChartPreview", () => ({
  useChartPreview: () => ({ data: undefined, isLoading: false, error: null }),
}));
// lightweight-charts 는 jsdom 에서 canvas 가 없어 createChart 가 깨지므로 차트 패널을 스텁.
vi.mock("@/components/review/ChartPanels", () => ({
  MinuteChartPanel: () => null,
  DailyChartPanel: () => null,
}));
vi.mock("@/components/chart/RealThemeOverlayChart", () => ({
  RealThemeOverlayChart: () => null,
}));

import { ReviewWorkspace } from "../ReviewWorkspace";
import { useReviewStore } from "@/stores/useReviewStore";

// ── 픽스처 ────────────────────────────────────────────────────────────────────
function makeGroup(code: string, name: string, times: string[]): ReviewStockGroup {
  return {
    groupKey: `${code}|2026-05-27`,
    stockCode: code,
    stockName: name,
    tradeDate: "2026-05-27",
    points: times.map((t, i) => ({
      pointKey: `${code}-${t}`,
      tradeTime: t,
      rowNumber: i + 1,
      reviewId: `${code}${i}`,
      manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
      sourceRow: {
        reviewId: `${code}${i}`,
        rowNumber: i + 1,
        stockCode: code,
        stockName: name,
        tradeDate: "2026-05-27",
        tradeTime: t,
        features: {},
        manual: {},
      },
    })),
  } as ReviewStockGroup;
}

const groups = [
  makeGroup("005930", "삼성전자", ["09:12", "10:30"]),
  makeGroup("000660", "SK하이닉스", ["09:05"]),
];
const initialSelection: InitialReviewSelection = {
  selectedGroupIndex: 0,
  selectedPointKey: "005930-09:12",
};

function renderWorkspace() {
  return render(
    <ReviewWorkspace
      groups={groups}
      initialSelection={initialSelection}
      manualKeys={[]}
      initialTab="review"
      hasSpreadsheet={false}
      initialReadSource="db"
    />,
  );
}

beforeEach(() => {
  // 작업셋 캐시 마운트 preload 등 네트워크는 조용히 실패시킨다(=preload 없음).
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  // 전역 zustand 스토어를 기본값으로 리셋(테스트 간 누수 방지).
  useReviewStore.setState({
    selectedGroupIndex: 0,
    selectedPointKey: null,
    viewMode: "summary",
    chartOverride: null,
    history: [],
  });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReviewWorkspace (smoke)", () => {
  it("초기 선택 그룹을 헤더에 렌더한다", () => {
    renderWorkspace();
    expect(screen.getByText("삼성전자")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy(); // 작업셋 위치 1/2
  });

  it("e 키로 다음 그룹으로 이동한다", () => {
    renderWorkspace();
    fireEvent.keyDown(window, { key: "e" });
    expect(screen.getByText("SK하이닉스")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("q 키로 이전 그룹으로 되돌아온다", () => {
    renderWorkspace();
    fireEvent.keyDown(window, { key: "e" }); // → 2번째
    fireEvent.keyDown(window, { key: "q" }); // → 다시 1번째
    expect(screen.getByText("삼성전자")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("Point List 의 타점들을 렌더하고 클릭해도 깨지지 않는다", () => {
    renderWorkspace();
    // "09:12" 는 헤더(선택 타점)와 Point List 양쪽에 나오므로 중복 허용으로 확인.
    expect(screen.getAllByText("09:12").length).toBeGreaterThan(0);
    // "10:30" 은 클릭 전엔 Point List 에만 있어 유일.
    fireEvent.click(screen.getByText("10:30")); // 타점 선택 → 마커 스냅(크래시 없어야 함)
    expect(screen.getAllByText("10:30").length).toBeGreaterThan(0);
  });
});
