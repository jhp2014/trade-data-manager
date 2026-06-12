"use client";

import { useEffect, useMemo, useState } from "react";
import { useChartPreview } from "@/hooks/useChartPreview";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { buildExploredGroup } from "@/lib/buildExploredGroup";
import { CHART_PARAMS_DEBOUNCE_MS } from "@/lib/constants";
import type { ChartOverlaySeries } from "@/types/chart";
import type { ReviewPoint, ReviewStockGroup } from "@/types/review";
import type { ChartOverride, HistoryEntry } from "@/stores/useReviewStore";

type UseExploreOverrideParams = {
  /** 임시 탐색 대상(null 이면 작업셋 선택 종목을 본다). */
  chartOverride: ChartOverride | null;
  groups: ReviewStockGroup[];
  selectedGroup: ReviewStockGroup;
  selectedGroupIndex: number;
  selectedPoint: ReviewPoint;
  filterActive: boolean;
  navigableIndices: number[];
  patchHistory: (entry: HistoryEntry) => void;
};

/**
 * 사이드바 임시 탐색(override)과 그에 따른 차트 데이터 파생을 한곳에 모은다.
 *
 * override 중이면 차트/Point List/입력 대상은 "클릭한 종목"(effectiveStock)이고,
 * 작업셋 선택(selectedGroup)은 그대로 유지된다. 차트 fetch 앵커는 테마 peer 탐색 시
 * 유지(무요청), 작업셋 밖 종목 탐색 시에만 그 종목으로 옮겨 새 번들을 받는다.
 */
export function useExploreOverride({
  chartOverride,
  groups,
  selectedGroup,
  selectedGroupIndex,
  selectedPoint,
  filterActive,
  navigableIndices,
  patchHistory,
}: UseExploreOverrideParams) {
  // 임시 탐색(override) 중이면 차트/테마 대상은 클릭한 종목, 아니면 리뷰 종목.
  const isOverride = chartOverride != null;
  const effectiveStock = chartOverride ?? {
    stockCode: selectedGroup.stockCode,
    tradeDate: selectedGroup.tradeDate,
    stockName: selectedGroup.stockName,
  };

  // 탐색 종목의 Point List 선택 키(작업셋 store 와 분리). override 진입 시 null →
  // 마커 스냅 없이 첫 포인트가 활성. 사용자가 리스트에서 클릭할 때만 마커가 따라온다.
  const [exploredPointKey, setExploredPointKey] = useState<string | null>(null);
  useEffect(() => {
    setExploredPointKey(null);
  }, [effectiveStock.stockCode, effectiveStock.tradeDate]);

  // 번들을 어느 종목 기준으로 받을지(앵커). 테마 peer 탐색은 이미 받아둔 번들 안에
  // 있으므로 앵커를 유지(=무요청). 작업셋 밖 종목을 붙여넣기/히스토리로 탐색할 때만
  // 그 종목으로 앵커를 옮겨 새 번들을 받는다.
  const [exploreAnchor, setExploreAnchor] = useState<ChartOverride | null>(null);
  useEffect(() => {
    if (chartOverride == null) setExploreAnchor(null);
  }, [chartOverride]);

  const anchorStock =
    isOverride && exploreAnchor
      ? exploreAnchor
      : {
          stockCode: selectedGroup.stockCode,
          tradeDate: selectedGroup.tradeDate,
          stockName: selectedGroup.stockName,
        };

  // 헤더 위치 인디케이터 기준 작업셋 인덱스.
  // override 중엔 탐색 종목의 작업셋 위치(없으면 -1 = 밖). 아니면 선택 인덱스.
  const indicatorGroupIndex = isOverride
    ? groups.findIndex(
        (g) => g.stockCode === effectiveStock.stockCode && g.tradeDate === effectiveStock.tradeDate,
      )
    : selectedGroupIndex;

  // 표시 위치/개수: 필터 활성 시 매칭 종목 기준. 작업셋 밖(-1)이면 -/N.
  const navPosition =
    indicatorGroupIndex < 0
      ? -1
      : filterActive
        ? Math.max(navigableIndices.indexOf(indicatorGroupIndex), 0)
        : indicatorGroupIndex;
  const navCount = filterActive ? navigableIndices.length : groups.length;

  // 차트 fetch 는 앵커 기준(테마 peer 탐색은 무요청, 작업셋 밖만 재요청).
  const chartParams = useMemo(
    () => ({ stockCode: anchorStock.stockCode, tradeDate: anchorStock.tradeDate }),
    [anchorStock.stockCode, anchorStock.tradeDate],
  );
  // q/e 로 빠르게 종목을 훑을 때 중간 종목의 차트를 매번 긁어오지 않도록
  // 차트 fetch 파라미터를 짧게 디바운스한다(선택/헤더는 즉시 반영).
  const debouncedChartParams = useDebouncedValue(chartParams, CHART_PARAMS_DEBOUNCE_MS);
  const chartPreview = useChartPreview(debouncedChartParams);
  const themes = useMemo(() => chartPreview.data?.themes ?? [], [chartPreview.data]);

  // 탐색 중인 종목의 오버레이 시리즈(번들이 실어 보낸 review/lineTargets 포함).
  // 작업셋 밖 종목이어도 번들에 있으면 추가 요청 없이 Point List/라인을 그린다.
  const activeReview = useMemo<ChartOverlaySeries | null>(() => {
    if (!isOverride) return null;
    for (const t of themes) {
      const found = t.overlaySeries.find((s) => s.stockCode === effectiveStock.stockCode);
      if (found) return found;
    }
    return null;
  }, [isOverride, themes, effectiveStock.stockCode]);

  // 작업셋 밖 종목은 히스토리에 코드만 기록된다. 번들 로드 후 진짜 종목명/배지를
  // 알게 되면 (순서는 유지한 채) 히스토리 항목을 보정한다.
  useEffect(() => {
    if (!isOverride || !activeReview || !activeReview.stockName) return;
    patchHistory({
      stockCode: effectiveStock.stockCode,
      tradeDate: effectiveStock.tradeDate,
      stockName: activeReview.stockName,
      hasReview: (activeReview.reviewPoints?.length ?? 0) > 0,
    });
  }, [isOverride, activeReview, effectiveStock.stockCode, effectiveStock.tradeDate, patchHistory]);

  // override 일 때만 의미. 번들 review → 클라이언트 ReviewStockGroup(작업셋과 동일 형태).
  const exploredGroup = useMemo(
    () =>
      buildExploredGroup({
        stockCode: effectiveStock.stockCode,
        stockName: effectiveStock.stockName ?? undefined,
        tradeDate: effectiveStock.tradeDate,
        lineTargets: activeReview?.lineTargets ?? [],
        reviewPoints: activeReview?.reviewPoints ?? [],
      }),
    [effectiveStock.stockCode, effectiveStock.stockName, effectiveStock.tradeDate, activeReview],
  );

  // Point List/라인/입력/삭제가 모두 바라보는 "현재 활성 종목".
  // override 면 탐색 종목, 아니면 작업셋 선택 종목.
  const activeGroup = isOverride ? exploredGroup : selectedGroup;
  const activePoint = isOverride
    ? exploredGroup.points.find((p) => p.pointKey === exploredPointKey) ?? exploredGroup.points[0]
    : selectedPoint;

  // 입력 가능 = 작업셋 종목이거나, 탐색 종목이 이미 review_target 일 때(결정 1).
  const canInput = !isOverride || (activeReview?.isReviewTarget ?? false);

  return {
    isOverride,
    effectiveStock,
    exploredPointKey,
    setExploredPointKey,
    setExploreAnchor,
    navPosition,
    navCount,
    chartPreview,
    themes,
    activeReview,
    activeGroup,
    activePoint,
    canInput,
  };
}
