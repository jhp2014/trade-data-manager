"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { kstHHmm } from "@trade-data-manager/chart-utils";
import { composeUnix } from "@/lib/serialization";
import { DEFAULT_MARKER_MINUTES, MARKER_WHEEL_STEP_MIN } from "@/lib/shortcuts";
import {
  timeStringToMinutes,
  minutesToTimeString,
  clampMinutes,
} from "@/components/review/TimeSlider";

type UseMarkerTimeParams = {
  /** 현재 타점 tradeTime("HH:MM[:SS]"). 마커 초기값/타점 변경 시 스냅 기준. */
  pointTradeTime: string;
  /** 현재 타점 키. 이 값이 바뀔 때만 마커를 타점 시각으로 재설정한다. */
  pointKey: string;
  /** 차트 종목의 거래일("YYYY-MM-DD"). markerTime(unix) 구성에 사용. */
  tradeDate: string;
  /**
   * 타점이 없을 때(빈 tradeTime) 마커가 설 첫 데이터 분(分). 현재 차트의 첫 분봉에서
   * 구한다. 미로드면 null. 데이터가 09:00 이후(예: 10:00)부터 시작할 때 마커가
   * 데이터 이전 빈 구간(=등락률 null, 마커 미렌더)에 머무는 것을 막는다.
   */
  fallbackMinutes?: number | null;
};

export type UseMarkerTimeResult = {
  /** 마커 시각(분 단위, 0~1439). */
  markerMinutes: number;
  /** 마커 분 직접 설정(타점 클릭 스냅 등에서 사용). */
  setMarkerMinutes: React.Dispatch<React.SetStateAction<number>>;
  /** 마커 시각의 unix 초(차트 마커/오버레이 정렬용). */
  markerTime: number | null;
  /** 마커 시각 "HH:MM"(입력/표시용). */
  markerTimeStr: string;
  /** 마커 ±step 분 이동. step 기본 1분, Shift 동작 시 1시간 등 호출부에서 지정. */
  moveMarker: (dir: 1 | -1, step?: number) => void;
  /** 분봉 클릭 시각(unix 초) → 해당 KST 분으로 마커 스냅. */
  handleMoveMarkerToTime: (timeUnix: number) => void;
};

/**
 * 마커 시간(분) 상태와 파생값을 관리한다.
 *
 * - 타점(pointKey)이 바뀔 때만 해당 타점 tradeTime 으로 재설정한다(테마 내 다른
 *   종목을 임시 조회할 때는 수동으로 옮긴 마커 시간을 유지).
 * - Shift+휠은 캡처 단계로 가로채 차트(lightweight-charts)의 휠 줌까지 막고 ±1분 이동.
 */
export function useMarkerTime({
  pointTradeTime,
  pointKey,
  tradeDate,
  fallbackMinutes = null,
}: UseMarkerTimeParams): UseMarkerTimeResult {
  const [markerMinutes, setMarkerMinutes] = useState<number>(
    () => timeStringToMinutes(pointTradeTime) ?? fallbackMinutes ?? DEFAULT_MARKER_MINUTES,
  );

  // 타점(Point)이 바뀔 때만 해당 타점 tradeTime(없으면 첫 데이터 분)으로 재설정.
  useEffect(() => {
    setMarkerMinutes(timeStringToMinutes(pointTradeTime) ?? fallbackMinutes ?? DEFAULT_MARKER_MINUTES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey]);

  // 타점이 없는데 데이터가 (디바운스로) 늦게 로드/교체되면, 마커가 데이터 시작
  // 이전(예: 기본 09:00 < 첫 봉 10:00)에 머무를 수 있다. 그 경우에만 첫 봉으로
  // 스냅한다. 사용자가 a/d 로 데이터 안쪽으로 옮긴 위치는 보존(앞설 때만 당김).
  useEffect(() => {
    if (pointTradeTime) return;
    if (fallbackMinutes == null) return;
    setMarkerMinutes((m) => (m < fallbackMinutes ? fallbackMinutes : m));
  }, [pointTradeTime, fallbackMinutes]);

  const markerTime = useMemo(
    () => composeUnix(tradeDate, minutesToTimeString(markerMinutes)),
    [tradeDate, markerMinutes],
  );

  const markerTimeStr = minutesToTimeString(markerMinutes);

  // Shift+휠 → 마커 시간 ±1분 이동. 캡처 단계에서 stopPropagation 으로 차트 휠 줌 차단.
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      setMarkerMinutes((m) =>
        clampMinutes(e.deltaY > 0 ? m + MARKER_WHEEL_STEP_MIN : m - MARKER_WHEEL_STEP_MIN),
      );
    };
    window.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handler, { capture: true });
  }, []);

  // a/d = 마커 시각 ±1분(키 자동반복으로 연속 이동). Shift+a/d = ±1시간.
  const moveMarker = useCallback((dir: 1 | -1, step: number = MARKER_WHEEL_STEP_MIN) => {
    setMarkerMinutes((m) => clampMinutes(m + dir * step));
  }, []);

  // 분봉 클릭 → 클릭한 봉 시각(unix 초)으로 마커 이동.
  // markerTime 구성(composeUnix(date, HH:MM))의 역으로 KST HH:MM 를 분으로 환산한다.
  const handleMoveMarkerToTime = useCallback((timeUnix: number) => {
    const mins = timeStringToMinutes(kstHHmm(timeUnix));
    if (mins != null) setMarkerMinutes(clampMinutes(mins));
  }, []);

  return {
    markerMinutes,
    setMarkerMinutes,
    markerTime,
    markerTimeStr,
    moveMarker,
    handleMoveMarkerToTime,
  };
}
