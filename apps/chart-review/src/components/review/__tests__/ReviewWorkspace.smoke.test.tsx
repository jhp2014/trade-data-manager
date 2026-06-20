// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InitialReviewSelection, ReviewStockGroup } from "@/types/review";
import type { ChartOverlaySeries, ChartThemeOverlay } from "@/types/chart";

// ── 무거운/외부 의존 목 (차트 캔버스·라우터·차트 preview·네트워크) ──────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/useChartPreview", () => ({ useChartPreview: vi.fn() }));
// lightweight-charts 는 jsdom 에서 canvas 가 없어 createChart 가 깨지므로 차트 패널을 스텁.
vi.mock("@/components/review/ChartPanels", () => ({
  MinuteChartPanel: () => null,
  DailyChartPanel: () => null,
}));
vi.mock("@/components/chart/RealThemeOverlayChart", () => ({
  RealThemeOverlayChart: () => null,
}));

import { ReviewWorkspace } from "../ReviewWorkspace";
import { useChartPreview } from "@/hooks/useChartPreview";
import { useReviewStore } from "@/stores/useReviewStore";

// 테마 사이드바가 렌더할 오버레이(self + 작업셋 밖 peer "카카오"). peer 클릭 → override.
function overlay(stockCode: string, stockName: string, isSelf: boolean): ChartOverlaySeries {
  return {
    stockCode, stockName, isSelf,
    series: [], daily: [], minute: [], lineTargets: [], reviewPoints: [],
    isReviewTarget: true, hasReview: false, isListingDay: false, firstMinuteOpen: null,
  };
}
const themes: ChartThemeOverlay[] = [
  {
    themeId: "t1",
    themeName: "반도체",
    overlaySeries: [overlay("005930", "삼성전자", true), overlay("035720", "카카오", false)],
  },
];

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

// window 에 paste 이벤트를 쏘는 헬퍼. 핸들러는 e.clipboardData?.getData("text") 를 읽는다.
function pasteText(text: string) {
  const ev = new Event("paste", { bubbles: true });
  Object.defineProperty(ev, "clipboardData", { value: { getData: () => text } });
  fireEvent(window, ev); // fireEvent 가 act() 로 감싸 React 상태를 flush 한다.
}

function copyText() {
  const setData = vi.fn();
  const ev = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: { setData } });
  fireEvent(window, ev);
  return { ev, setData };
}

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
  vi.mocked(useChartPreview).mockReturnValue({
    data: { themes, daily: [], minute: [], prevCloseKrx: null, prevCloseNxt: null, isListingDay: false },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useChartPreview>);
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
    // "삼성전자" 는 헤더와 테마 사이드바(self 행) 양쪽에 나오므로 중복 허용.
    expect(screen.getAllByText("삼성전자").length).toBeGreaterThan(0);
    expect(screen.getByText("1/2")).toBeTruthy(); // 작업셋 위치 1/2 (헤더 고유)
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
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getAllByText("삼성전자").length).toBeGreaterThan(0);
  });

  it("Point List 의 타점들을 렌더하고 클릭해도 깨지지 않는다", () => {
    renderWorkspace();
    // "09:12" 는 헤더(선택 타점)와 Point List 양쪽에 나오므로 중복 허용으로 확인.
    expect(screen.getAllByText("09:12").length).toBeGreaterThan(0);
    // "10:30" 은 클릭 전엔 Point List 에만 있어 유일.
    fireEvent.click(screen.getByText("10:30")); // 타점 선택 → 마커 스냅(크래시 없어야 함)
    expect(screen.getAllByText("10:30").length).toBeGreaterThan(0);
  });

  it("CaseId 붙여넣기 → 작업셋 종목/타점으로 이동", () => {
    renderWorkspace();
    pasteText("000660-2026-05-27-0905"); // SK하이닉스 09:05 타점
    expect(screen.getByText("SK하이닉스")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("Ctrl+C 복사 이벤트는 현재 타점의 CaseId 를 클립보드에 쓴다", () => {
    renderWorkspace();

    const { ev, setData } = copyText();

    expect(ev.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith("text/plain", "005930-2026-05-27-0912");
  });

  it("CaseId 의 시각과 일치하는 타점이 없으면 첫 타점으로 fallback(크래시 없음)", () => {
    renderWorkspace();
    pasteText("000660-2026-05-27-2300"); // 23:00 타점은 없음 → 첫 타점 fallback
    expect(screen.getByText("SK하이닉스")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("시각 없는 GroupId 붙여넣기는 기존대로 종목만 이동", () => {
    renderWorkspace();
    pasteText("000660-2026-05-27");
    expect(screen.getByText("SK하이닉스")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("테마 사이드바의 작업셋 밖 peer 클릭 → override, c 로 복귀", () => {
    renderWorkspace();
    // 테마 행 버튼(title="이름 코드")으로 작업셋 밖 종목 카카오 선택.
    fireEvent.click(screen.getByTitle("카카오 035720"));
    expect(screen.getByText("-/2")).toBeTruthy(); // 작업셋 밖 → 위치 -/N
    expect(screen.getAllByText("카카오").length).toBeGreaterThan(0); // 헤더가 탐색 종목 표시

    fireEvent.keyDown(window, { key: "c" }); // override 해제 → 선택 종목 복귀
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getAllByText("삼성전자").length).toBeGreaterThan(0);
  });
});
