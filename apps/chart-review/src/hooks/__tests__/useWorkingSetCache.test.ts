// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReviewStockGroup } from "@/types/review";

// 네트워크(apiClient)를 목해 캐시/전환 로직만 검증한다.
vi.mock("@/lib/apiClient", () => ({ getJson: vi.fn(), getJsonOrNull: vi.fn() }));
import { getJson, getJsonOrNull } from "@/lib/apiClient";
import { useWorkingSetCache } from "@/hooks/useWorkingSetCache";

function grp(code: string): ReviewStockGroup {
  return {
    groupKey: `${code}|2026-05-27`,
    stockCode: code,
    stockName: code,
    tradeDate: "2026-05-27",
    points: [
      {
        pointKey: `${code}-p`,
        tradeTime: "09:00",
        rowNumber: 1,
        reviewId: "r",
        manualSummary: { filledCount: 0, totalCount: 0, missingRequired: [], preview: {} },
        sourceRow: {
          reviewId: "r",
          rowNumber: 1,
          stockCode: code,
          stockName: code,
          tradeDate: "2026-05-27",
          tradeTime: "09:00",
          features: {},
          manual: {},
        },
      },
    ],
  } as ReviewStockGroup;
}

const initial = [grp("005930")];
const tab2Groups = [grp("000660")];
const dbGroups = [grp("035720"), grp("000660")];

beforeEach(() => {
  // 마운트 preload 는 무력화(탭 목록 없음).
  vi.mocked(getJsonOrNull).mockResolvedValue(null);
  vi.mocked(getJson).mockImplementation(async (url: string) => {
    // 탭 작업셋은 ?tab=, DB 작업셋은 ?months=/?all=/?from=.
    if (url.includes("tab=")) return { groups: tab2Groups } as never;
    return { groups: dbGroups, range: { from: "2026-04-27", to: "2026-05-27" } } as never;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useWorkingSetCache", () => {
  it("초기에는 prop 으로 받은 groups/tab/source 를 그대로 노출한다", () => {
    const { result } = renderHook(() => useWorkingSetCache(initial, "review", "sheet"));
    expect(result.current.groups).toBe(initial);
    expect(result.current.readTab).toBe("review");
    expect(result.current.readSource).toBe("sheet");
  });

  it("switchTab: 캐시에 없으면 fetch 하고, 두 번째 호출은 캐시 히트(재요청 없음)", async () => {
    const { result } = renderHook(() => useWorkingSetCache(initial, "review", "sheet"));

    await act(async () => {
      await result.current.switchTab("review2");
    });
    expect(result.current.readTab).toBe("review2");
    expect(result.current.groups).toEqual(tab2Groups);
    expect(vi.mocked(getJson)).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.switchTab("review2"); // 캐시 히트
    });
    expect(vi.mocked(getJson)).toHaveBeenCalledTimes(1); // 재요청 없음
  });

  it("switchToDb: DB 작업셋을 받아 source=db 로 전환", async () => {
    const { result } = renderHook(() => useWorkingSetCache(initial, "review", "sheet"));
    await act(async () => {
      await result.current.switchToDb();
    });
    expect(result.current.readSource).toBe("db");
    expect(result.current.groups).toEqual(dbGroups);
  });

  it("switchToDb: 기본 요청은 months=1 로 호출하고 응답 range 를 노출한다", async () => {
    const { result } = renderHook(() => useWorkingSetCache(initial, "review", "sheet"));
    await act(async () => {
      await result.current.switchToDb();
    });
    expect(vi.mocked(getJson)).toHaveBeenCalledWith(
      "/api/review/workset?months=1",
      expect.anything(),
    );
    expect(result.current.dbRange).toEqual({ from: "2026-04-27", to: "2026-05-27" });
  });

  it("setDbRange(all): all=1 로 호출하고 range=null(전체) 로 전환", async () => {
    vi.mocked(getJson).mockImplementation(async (url: string) => {
      if (url.includes("all=1")) return { groups: dbGroups, range: null } as never;
      return { groups: tab2Groups } as never;
    });
    const { result } = renderHook(() => useWorkingSetCache(initial, "review", "sheet"));
    await act(async () => {
      await result.current.setDbRange({ all: true });
    });
    expect(result.current.readSource).toBe("db");
    expect(result.current.dbRange).toBeNull();
  });

  it("마운트 시 탭 목록을 받아 tabs 를 갱신한다", async () => {
    vi.mocked(getJsonOrNull).mockImplementation(async (url: string) => {
      if (url === "/api/review/sheets/tabs") return { tabs: ["review", "review2"] } as never;
      return { groups: tab2Groups } as never; // preload workset
    });
    const { result } = renderHook(() => useWorkingSetCache(initial, "review", "sheet"));
    await waitFor(() => expect(result.current.tabs).toEqual(["review", "review2"]));
  });
});
