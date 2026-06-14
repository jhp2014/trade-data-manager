// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMarkerTime } from "@/hooks/useMarkerTime";
import { composeUnix } from "@/lib/serialization";

const DATE = "2026-05-27";

afterEach(() => cleanup());

describe("useMarkerTime", () => {
  it("타점 tradeTime 으로 마커를 초기화한다", () => {
    const { result } = renderHook(() =>
      useMarkerTime({ pointTradeTime: "09:12:00", pointKey: "p1", tradeDate: DATE }),
    );
    expect(result.current.markerTimeStr).toBe("09:12:00");
    // markerTime 은 KST 09:12 의 unix
    expect(result.current.markerTime).toBe(composeUnix(DATE, "09:12"));
  });

  it("pointKey 가 바뀌면 새 타점 시각으로 스냅한다", () => {
    const { result, rerender } = renderHook((props) => useMarkerTime(props), {
      initialProps: { pointTradeTime: "09:12:00", pointKey: "p1", tradeDate: DATE },
    });
    rerender({ pointTradeTime: "10:30:00", pointKey: "p2", tradeDate: DATE });
    expect(result.current.markerTimeStr).toBe("10:30:00");
  });

  it("pointKey 가 그대로면 tradeTime 이 바뀌어도 마커를 유지한다(수동 이동 보존)", () => {
    const { result, rerender } = renderHook((props) => useMarkerTime(props), {
      initialProps: { pointTradeTime: "09:12:00", pointKey: "p1", tradeDate: DATE },
    });
    // 같은 pointKey 로 tradeTime 만 다르게 → 재설정 안 됨
    rerender({ pointTradeTime: "10:30:00", pointKey: "p1", tradeDate: DATE });
    expect(result.current.markerTimeStr).toBe("09:12:00");
  });

  it("moveMarker 는 ±step 분 이동하고 장 시간(08:00~20:00)으로 clamp 한다", () => {
    const { result } = renderHook(() =>
      useMarkerTime({ pointTradeTime: "09:12:00", pointKey: "p1", tradeDate: DATE }),
    );
    act(() => result.current.moveMarker(1)); // 기본 1분 → 09:13
    expect(result.current.markerTimeStr).toBe("09:13:00");

    act(() => result.current.moveMarker(1, 60)); // +60분 → 10:13
    expect(result.current.markerTimeStr).toBe("10:13:00");

    act(() => result.current.moveMarker(-1, 600)); // -600분 → clamp 08:00
    expect(result.current.markerTimeStr).toBe("08:00:00");
  });

  it("타점이 없으면 fallbackMinutes(첫 봉)로 초기화한다", () => {
    const { result } = renderHook(() =>
      useMarkerTime({ pointTradeTime: "", pointKey: "p1", tradeDate: DATE, fallbackMinutes: 600 }),
    );
    // 빈 tradeTime → 09:00 기본이 아니라 첫 봉 10:00(600분)으로 스냅
    expect(result.current.markerTimeStr).toBe("10:00:00");
  });

  it("타점이 없고 데이터가 늦게 로드되면(첫 봉 분 도착) 마커를 첫 봉으로 당긴다", () => {
    const { result, rerender } = renderHook((props) => useMarkerTime(props), {
      initialProps: { pointTradeTime: "", pointKey: "p1", tradeDate: DATE, fallbackMinutes: null as number | null },
    });
    // 미로드 시점엔 기본 09:00
    expect(result.current.markerTimeStr).toBe("09:00:00");
    // 데이터 로드 → 첫 봉 10:00 도착 시 데이터 이전(09:00)이므로 스냅
    rerender({ pointTradeTime: "", pointKey: "p1", tradeDate: DATE, fallbackMinutes: 600 });
    expect(result.current.markerTimeStr).toBe("10:00:00");
  });

  it("타점이 없어도 사용자가 데이터 안쪽으로 옮긴 마커는 보존한다(앞설 때만 당김)", () => {
    const { result } = renderHook(() =>
      useMarkerTime({ pointTradeTime: "", pointKey: "p1", tradeDate: DATE, fallbackMinutes: 600 }),
    );
    act(() => result.current.moveMarker(1, 60)); // 10:00 → 11:00 (데이터 안쪽)
    expect(result.current.markerTimeStr).toBe("11:00:00");
    // fallback 이 유지돼도 11:00 > 10:00 이므로 당기지 않음
  });

  it("handleMoveMarkerToTime 은 봉 시각(unix)을 KST 분으로 스냅한다", () => {
    const { result } = renderHook(() =>
      useMarkerTime({ pointTradeTime: "09:12:00", pointKey: "p1", tradeDate: DATE }),
    );
    const unix11 = composeUnix(DATE, "11:00")!;
    act(() => result.current.handleMoveMarkerToTime(unix11));
    expect(result.current.markerTimeStr).toBe("11:00:00");
  });
});
