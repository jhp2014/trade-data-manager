"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./ReviewWorkspace.module.css";
import { RealDailyChart } from "@/components/chart/RealDailyChart";
import { RealMinuteChart } from "@/components/chart/RealMinuteChart";
import { RealThemeOverlayChart } from "@/components/chart/RealThemeOverlayChart";
import { ThemeSidebar } from "./ThemeSidebar";
import { SettingsModal } from "./modals/SettingsModal";
import { activeFilterCount, pointMatchesManualFilters } from "@/lib/manualFilter";
import {
  TimeSlider,
  timeStringToMinutes,
  minutesToTimeString,
  clampMinutes,
} from "./TimeSlider";
import { createReviewCommands } from "@/lib/reviewCommands";
import { composeUnix, dateToUnix } from "@/lib/serialization";
import { truncate } from "@/lib/format";
import { useChartPreview } from "@/hooks/useChartPreview";
import { useUiStore } from "@/stores/useUiStore";
import type {
  InitialReviewSelection,
  ReviewPoint,
  ReviewStockGroup,
  ReviewViewMode,
} from "@/types/review";
import type { ChartOverlaySeries } from "@/types/chart";
import type { ManualKeyDef } from "@/lib/loadManualKeys";
import { useReviewStore, type ChartOverride } from "@/stores/useReviewStore";
import { PointInputDrawer } from "./PointInputDrawer";
import { HistorySwitcher } from "./HistorySwitcher";
import { buildExploredGroup } from "@/lib/buildExploredGroup";
import { CHART_PARAMS_DEBOUNCE_MS, PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK } from "@/lib/constants";
import {
  VIEW_MODES,
  DEFAULT_MARKER_MINUTES,
  MARKER_WHEEL_STEP_MIN,
  MARKER_HOUR_STEP_MIN,
  SWITCHER_AUTO_COMMIT_MS,
  cycleViewMode,
} from "@/lib/shortcuts";
import { computeThemeMemberMetrics, topByRate } from "@/lib/themeMetrics";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useWorkingSetCache } from "@/hooks/useWorkingSetCache";

type ReviewWorkspaceProps = {
  groups: ReviewStockGroup[];
  initialSelection: InitialReviewSelection;
  manualKeys: ManualKeyDef[];
  /** 현재 읽기 시트 탭 이름(RSC 에서 전달). 탭 칩 초기화용. */
  initialTab: string;
  /** 스프레드시트가 설정돼 있는지. false 면 탭 칩을 표시하지 않는다. */
  hasSpreadsheet: boolean;
};

const VALUE_TRUNCATE = 15;

export function ReviewWorkspace({
  groups: initialGroups,
  initialSelection,
  manualKeys,
  initialTab,
  hasSpreadsheet,
}: ReviewWorkspaceProps) {
  const router = useRouter();
  const manualFilters = useUiStore((state) => state.manualFilters);
  const filterActive = activeFilterCount(manualFilters) > 0;
  const writeTab = useUiStore((state) => state.writeTab);
  const setWriteTab = useUiStore((state) => state.setWriteTab);
  const exportFieldKeys = useUiStore((state) => state.exportFieldKeys);
  const tabPositions = useUiStore((state) => state.tabPositions);
  const setTabPosition = useUiStore((state) => state.setTabPosition);

  // 탭별 작업셋 캐시. initialGroups は初期タブのデータとして渡す.
  const {
    tabs,
    readTab,
    groups,
    isLoadingWorkset,
    switchTab,
    reloadTab,
    reloadAll,
  } = useWorkingSetCache(initialGroups, initialTab);

  // 필터 활성 시 종목 이동은 "매칭 타점이 1개 이상 있는 종목"만 순회한다.
  // (종목 안에서는 전 타점을 그대로 보여주되 PointList 에서 매칭 배지를 표시)
  const navigableIndices = useMemo(() => {
    if (!filterActive) return groups.map((_, i) => i);
    return groups
      .map((group, i) => ({
        i,
        hit: group.points.some((p) => pointMatchesManualFilters(p, manualFilters)),
      }))
      .filter((g) => g.hit)
      .map((g) => g.i);
  }, [groups, filterActive, manualFilters]);

  const commands = useMemo(
    () => createReviewCommands(groups, navigableIndices),
    [groups, navigableIndices],
  );
  const storeGroupIndex = useReviewStore((state) => state.selectedGroupIndex);
  const storePointKey = useReviewStore((state) => state.selectedPointKey);
  const viewMode = useReviewStore((state) => state.viewMode);
  const chartOverride = useReviewStore((state) => state.chartOverride);
  const setChartOverride = useReviewStore((state) => state.setChartOverride);
  const hydrateSelection = useReviewStore((state) => state.hydrateSelection);
  const history = useReviewStore((state) => state.history);
  const pushHistory = useReviewStore((state) => state.pushHistory);
  const patchHistory = useReviewStore((state) => state.patchHistory);
  const priceMode = useUiStore((state) => state.chartPriceMode);

  // Read Tab 전환: 현재 위치를 저장하고 대상 탭의 저장된 위치를 복원한다.
  const handleSwitchReadTab = useCallback(
    async (newTab: string) => {
      if (newTab === readTab) return;
      setTabPosition(readTab, { groupIndex: storeGroupIndex, pointKey: storePointKey });
      const newGroups = await switchTab(newTab);
      const savedPos = tabPositions[newTab];
      const newGroupIndex = Math.min(savedPos?.groupIndex ?? 0, Math.max(0, newGroups.length - 1));
      const newGroup = newGroups[newGroupIndex] ?? newGroups[0];
      const newPointKey = savedPos?.pointKey ?? newGroup?.points[0]?.pointKey ?? "";
      useReviewStore.getState().hydrateSelection({
        selectedGroupIndex: newGroupIndex,
        selectedPointKey: newPointKey,
      });
    },
    [readTab, storeGroupIndex, storePointKey, switchTab, tabPositions, setTabPosition],
  );

  // URL(초기 선택)에서 파생된 선택값이 실제로 바뀔 때만 store 를 재설정한다.
  // initialSelection 은 force-dynamic 페이지가 서버 액션마다 재렌더되며 매번
  // 새 객체로 생성되므로, 객체 참조에 의존하면 store churn → 무한 재조회 루프가 발생.
  useEffect(() => {
    hydrateSelection(initialSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection.selectedGroupIndex, initialSelection.selectedPointKey]);

  const selectedGroupIndex = storePointKey ? storeGroupIndex : initialSelection.selectedGroupIndex;
  const selectedPointKey = storePointKey ?? initialSelection.selectedPointKey;
  const selectedGroup = groups[selectedGroupIndex] ?? groups[0];
  const selectedPoint =
    selectedGroup.points.find((point) => point.pointKey === selectedPointKey) ??
    selectedGroup.points[0];

  // paste/history 등 명시적 이동 시 snap을 한 번 건너뛰는 플래그.
  // setSelectedGroupIndex 직후 이 effect 가 snap-back 하는 것을 막는다.
  const bypassFilterSnapRef = useRef(false);

  // 필터를 켜거나 바꿨을 때 현재 선택 종목이 매칭 목록 밖이면 첫 매칭 종목으로 스냅.
  // navigateToGroupId 가 bypassFilterSnapRef 를 세우면 한 번 건너뛴다.
  useEffect(() => {
    if (!filterActive || navigableIndices.length === 0) return;
    if (navigableIndices.includes(selectedGroupIndex)) return;
    if (bypassFilterSnapRef.current) {
      bypassFilterSnapRef.current = false;
      return;
    }
    const first = navigableIndices[0];
    const store = useReviewStore.getState();
    store.setSelectedGroupIndex(first);
    store.setSelectedPointKey(groups[first].points[0].pointKey);
  }, [filterActive, navigableIndices, selectedGroupIndex, groups]);

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
  // a/d 로 빠르게 종목을 훑을 때 중간 종목의 차트를 매번 긁어오지 않도록
  // 차트 fetch 파라미터를 200ms 디바운스한다(선택/헤더는 즉시 반영).
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

  // 마커 시간(분 단위). 타점 tradeTime 으로 초기화하되 휠/슬라이더로 조정 가능.
  // tradeTime 이 없으면 09:00(540분) 기본.
  const [markerMinutes, setMarkerMinutes] = useState<number>(
    () => timeStringToMinutes(selectedPoint.tradeTime) ?? DEFAULT_MARKER_MINUTES,
  );

  // 타점(Point)이 바뀔 때만 해당 타점 tradeTime 으로 재설정.
  // 테마 내 다른 종목을 임시 조회(override)할 때는 수동으로 옮긴 마커 시간을 유지한다.
  useEffect(() => {
    setMarkerMinutes(timeStringToMinutes(selectedPoint.tradeTime) ?? DEFAULT_MARKER_MINUTES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoint.pointKey]);

  const markerTime = useMemo(
    () => composeUnix(effectiveStock.tradeDate, minutesToTimeString(markerMinutes)),
    [effectiveStock.tradeDate, markerMinutes],
  );

  // 테마 탭 선택 상태. 종목(테마 집합)이 바뀌면 멤버 최다 테마로 초기화.
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const themeIdsKey = themes.map((t) => t.themeId).join("|");
  useEffect(() => {
    if (themes.length === 0) {
      setSelectedThemeId(null);
      return;
    }
    const primary = [...themes].sort((a, b) => b.overlaySeries.length - a.overlaySeries.length)[0];
    setSelectedThemeId(primary.themeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeIdsKey]);

  const selectedThemeName =
    themes.find((t) => t.themeId === selectedThemeId)?.themeName ?? themes[0]?.themeName ?? null;

  // 노출 가능한 필드 키 (전 그룹 통합).
  const { manualFieldKeys, featureFieldKeys } = useMemo(() => collectFieldKeys(groups), [groups]);
  // 입력 드로어 값 추천: 전 그룹의 manual 값을 키별 distinct 로 수집.
  const valueSuggestions = useMemo(() => collectValueSuggestions(groups), [groups]);
  const headerAvailable = useMemo(
    () => [...manualFieldKeys, ...featureFieldKeys],
    [manualFieldKeys, featureFieldKeys],
  );

  // 일봉 라인 타깃: 현재 활성 종목(active)의 features.lineTargets("9010 | 9450").
  // 탐색(override) 중이면 번들이 실어 보낸 탐색 종목의 lineTargets 로 선을 그린다(결정 3).
  const dailyPriceLines = useMemo(() => {
    const targets = parseLineTargets(activePoint.sourceRow.features.lineTargets);
    return targets.length > 0 ? { lineTargets: targets } : undefined;
  }, [activePoint.sourceRow.features.lineTargets]);

  // 활성 테마의 오버레이 시리즈 (분봉 크로스헤어·테마뷰 공용)
  const activeThemeOverlay = useMemo(() => {
    const theme = themes.find((t) => t.themeId === selectedThemeId) ?? themes[0];
    return theme?.overlaySeries ?? [];
  }, [themes, selectedThemeId]);

  // w/s 단축키가 따라갈 테마 리스트 표시 순서. ThemeSidebar 와 동일한 정렬을 재계산해
  // 현재 보고 있는 종목 기준 위/아래 종목을 찾는다.
  const themeRowOrder = useMemo(
    () =>
      topByRate(
        computeThemeMemberMetrics(
          activeThemeOverlay,
          markerTime,
          priceMode,
          PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK,
        ),
        activeThemeOverlay.length,
      ),
    [activeThemeOverlay, markerTime, priceMode],
  );

  // 메인 차트(일봉/분봉) 데이터. 탐색(override) 중이고 그 종목이 현재 번들에 있으면
  // 이미 받아둔 멤버 raw(daily/minute)로 그려 추가 요청을 없앤다(무요청 탐색).
  // 번들 밖(앵커 자신/로딩 중)이면 앵커 self 차트를 그대로 사용.
  const mainChartData = useMemo(() => {
    const data = chartPreview.data;
    if (!data || !isOverride || !activeReview) return data;
    const entryTime = dateToUnix(effectiveStock.tradeDate);
    const entryCandle = activeReview.daily.find((c) => c.time === entryTime) ?? null;
    return {
      ...data,
      daily: activeReview.daily,
      minute: activeReview.minute,
      prevCloseKrx: entryCandle?.prevCloseKrx ?? null,
      prevCloseNxt: entryCandle?.prevCloseNxt ?? null,
    };
  }, [chartPreview.data, isOverride, activeReview, effectiveStock.tradeDate]);

  // Shift+휠 → 마커 시간(tradeTime) ±1분 이동 (차트 Point 마커도 함께 이동)
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      setMarkerMinutes((m) =>
        clampMinutes(e.deltaY > 0 ? m + MARKER_WHEEL_STEP_MIN : m - MARKER_WHEEL_STEP_MIN),
      );
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, []);

  const handleSelectStock = useCallback(
    (stockCode: string, stockName: string) => {
      if (stockCode === selectedGroup.stockCode) {
        setChartOverride(null);
        return;
      }
      setChartOverride({ stockCode, tradeDate: effectiveStock.tradeDate, stockName });
    },
    [selectedGroup.stockCode, effectiveStock.tradeDate, setChartOverride],
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const openInput = useCallback(() => {
    if (canInput) setInputOpen(true);
  }, [canInput]);

  // 탐색 리스트에서 포인트 클릭: 작업셋 store 는 건드리지 않고(=a/d 복귀 유지)
  // 탐색 선택만 바꾸고 마커를 그 tradeTime 으로 옮긴다.
  const handleSelectExploredPoint = useCallback(
    (pointKey: string) => {
      setExploredPointKey(pointKey);
      const p = exploredGroup.points.find((x) => x.pointKey === pointKey);
      const mins = p ? timeStringToMinutes(p.tradeTime) : null;
      if (mins != null) setMarkerMinutes(mins);
    },
    [exploredGroup],
  );

  // a/d = 마커 시각 ±1분(키 자동반복으로 연속 이동). Shift+a/d = ±1시간.
  const moveMarker = useCallback((dir: 1 | -1, step: number = MARKER_WHEEL_STEP_MIN) => {
    setMarkerMinutes((m) => clampMinutes(m + dir * step));
  }, []);

  // Ctrl+a/Ctrl+d = 타점 탐색. override 중이면 작업셋 store 를 건드리지 않고
  // 탐색 종목의 Point List 안에서 위(과거)/아래(미래)로 이동한다(버그 수정: 본 종목 복귀 방지).
  const movePoint = useCallback(
    (dir: 1 | -1) => {
      if (isOverride) {
        const pts = exploredGroup.points;
        if (pts.length === 0) return;
        const curIdx = pts.findIndex((p) => p.pointKey === activePoint.pointKey);
        const base = curIdx < 0 ? 0 : curIdx;
        const nextIdx = Math.min(pts.length - 1, Math.max(0, base + dir));
        handleSelectExploredPoint(pts[nextIdx].pointKey);
      } else if (dir < 0) {
        commands.prevPoint();
      } else {
        commands.nextPoint();
      }
    },
    [isOverride, exploredGroup, activePoint.pointKey, handleSelectExploredPoint, commands],
  );

  // w/s = 테마 리스트 위/아래 종목 탐색(가장 끝에서 순환). 표시 순서(themeRowOrder)를
  // 기준으로 현재 보고 있는 종목의 이웃을 선택한다.
  const navigateThemeRow = useCallback(
    (dir: 1 | -1) => {
      const rows = themeRowOrder;
      if (rows.length === 0) return;
      const curIdx = rows.findIndex((r) => r.stockCode === effectiveStock.stockCode);
      const base = curIdx < 0 ? (dir === 1 ? -1 : 0) : curIdx;
      const nextIdx = (base + dir + rows.length) % rows.length;
      const row = rows[nextIdx];
      handleSelectStock(row.stockCode, row.stockName);
    },
    [themeRowOrder, effectiveStock.stockCode, handleSelectStock],
  );

  const cycleView = useCallback(() => {
    commands.setViewMode(cycleViewMode(viewMode, 1));
  }, [commands, viewMode]);

  const resetOverride = useCallback(() => setChartOverride(null), [setChartOverride]);

  // f 키: Write Tab 마지막 행에 현재 탐색 종목 데이터를 추가한다.
  const [writeAppendStatus, setWriteAppendStatus] = useState<string | null>(null);
  const handleWriteAppend = useCallback(async () => {
    if (!writeTab) return;
    const headers = exportFieldKeys;
    const values = headers.map((key) => resolveFieldValue(key, activePoint));
    try {
      const res = await fetch("/api/review/write-sheet/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writeTab, headers, values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "append 실패");
      pushHistory({
        stockCode: effectiveStock.stockCode,
        tradeDate: effectiveStock.tradeDate,
        stockName: effectiveStock.stockName ?? undefined,
      });
      setWriteAppendStatus("✓ 추가됨");
    } catch (err) {
      setWriteAppendStatus(`✗ ${err instanceof Error ? err.message : "오류"}`);
    }
    // 2초 후 상태 메시지 초기화.
    setTimeout(() => setWriteAppendStatus(null), 2000);
  }, [writeTab, exportFieldKeys, activePoint, effectiveStock, pushHistory]);

  // Read Tab 순환: 탭 목록에서 다음 탭으로 전환하고 작업셋을 리로드한다.
  const handleCycleReadTab = useCallback(async () => {
    if (tabs.length <= 1) return;
    const idx = tabs.indexOf(readTab);
    const nextIdx = (idx + 1) % tabs.length;
    await handleSwitchReadTab(tabs[nextIdx]);
  }, [tabs, readTab, handleSwitchReadTab]);

  // Write Tab 순환: 탭 목록에서 다음 탭으로 전환한다(새 탭 생성은 설정에서).
  const handleCycleWriteTab = useCallback(() => {
    if (tabs.length === 0) return;
    const idx = writeTab ? tabs.indexOf(writeTab) : -1;
    const nextIdx = (idx + 1) % tabs.length;
    setWriteTab(tabs[nextIdx]);
  }, [tabs, writeTab, setWriteTab]);

  // useGlobalShortcuts 가 받는 무인자 콜백 어댑터(방향/스텝 인자 고정).
  const handleMarkerLeft = useCallback(() => moveMarker(-1), [moveMarker]);
  const handleMarkerRight = useCallback(() => moveMarker(1), [moveMarker]);
  const handleShiftMarkerLeft = useCallback(() => moveMarker(-1, MARKER_HOUR_STEP_MIN), [moveMarker]);
  const handleShiftMarkerRight = useCallback(() => moveMarker(1, MARKER_HOUR_STEP_MIN), [moveMarker]);
  const handlePrevPoint = useCallback(() => movePoint(-1), [movePoint]);
  const handleNextPoint = useCallback(() => movePoint(1), [movePoint]);
  const handleThemeUp = useCallback(() => navigateThemeRow(-1), [navigateThemeRow]);
  const handleThemeDown = useCallback(() => navigateThemeRow(1), [navigateThemeRow]);

  // GroupId 복붙/Tab 히스토리 탐색.
  // 히스토리는 "복붙으로 도달한 종목"만 기록한다(a/d 순회는 기록하지 않음).
  const navigateToGroupId = useCallback(
    (code: string, date: string) => {
      const idx = groups.findIndex((g) => g.stockCode === code && g.tradeDate === date);
      if (idx >= 0) {
        const g = groups[idx];
        pushHistory({
          stockCode: g.stockCode,
          tradeDate: g.tradeDate,
          stockName: g.stockName ?? undefined,
          hasReview: g.points.some((p) => !!p.tradeTime),
        });
        // 필터 활성 시 snap effect 가 즉시 되돌리지 않도록 한 번 건너뛴다.
        bypassFilterSnapRef.current = true;
        commands.goToGroup(idx);
      } else {
        // 작업셋 밖 그룹 → 풀 네비게이션 대신 제자리(override) 탐색.
        // 작업셋 밖은 현재 번들에 없을 수 있으므로 앵커를 이 종목으로 옮겨 새 번들을 받는다.
        // stockName 은 미상이라 코드로 두고, 번들 로드 후 activeReview 에서 보정한다.
        pushHistory({ stockCode: code, tradeDate: date });
        setExploreAnchor({ stockCode: code, tradeDate: date, stockName: code });
        setChartOverride({ stockCode: code, tradeDate: date, stockName: code });
      }
    },
    [groups, commands, pushHistory, setChartOverride],
  );

  // 브라우저 포커스 상태에서 GroupId(예: 005930-2026-05-27) 붙여넣기 → 즉시 탐색.
  // 입력 요소/모달에 포커스가 있으면(값 붙여넣기 등) 무시한다.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (inputOpen || settingsOpen) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      const parsed = parseGroupId(e.clipboardData?.getData("text") ?? "");
      if (!parsed) return;
      e.preventDefault();
      navigateToGroupId(parsed.code, parsed.date);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [inputOpen, settingsOpen, navigateToGroupId]);

  // Tab 히스토리 스위처: Tab=모달 오픈, 모달에서 Tab/s=다음·Shift+Tab/w=이전,
  // Space/Enter=선택, Esc=취소. 2초 멈추면 현재 하이라이트로 자동 확정.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherIndex, setSwitcherIndex] = useState(0);
  const switcherOpenRef = useRef(false);
  const switcherIndexRef = useRef(0);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const selectedGroupKeyRef = useRef("");
  selectedGroupKeyRef.current = `${selectedGroup.stockCode}-${selectedGroup.tradeDate}`;

  const setSwitcherIdx = useCallback((i: number) => {
    switcherIndexRef.current = i;
    setSwitcherIndex(i);
  }, []);

  const closeSwitcher = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    switcherOpenRef.current = false;
    setSwitcherOpen(false);
  }, []);

  const commitSwitcher = useCallback(
    (index: number) => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
      switcherOpenRef.current = false;
      setSwitcherOpen(false);
      const entry = historyRef.current[index];
      if (entry) navigateToGroupId(entry.stockCode, entry.tradeDate);
    },
    [navigateToGroupId],
  );

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(
      () => commitSwitcher(switcherIndexRef.current),
      SWITCHER_AUTO_COMMIT_MS,
    );
  }, [commitSwitcher]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 닫힌 상태: Tab 으로만 연다.
      if (!switcherOpenRef.current) {
        if (e.key !== "Tab") return;
        if (inputOpen || settingsOpen) return;
        const tgt = e.target as HTMLElement | null;
        const tag = tgt?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt?.isContentEditable) {
          return;
        }
        const list = historyRef.current;
        if (list.length < 1) return; // 기록 없음
        e.preventDefault();
        e.stopPropagation();
        switcherOpenRef.current = true;
        setSwitcherOpen(true);
        // 최상단이 현재 차트면 직전 항목부터, 아니면 최상단부터.
        const topKey = `${list[0].stockCode}-${list[0].tradeDate}`;
        const start = list.length >= 2 && topKey === selectedGroupKeyRef.current ? 1 : 0;
        setSwitcherIdx(start);
        scheduleCommit();
        return;
      }
      // 열린 상태: 이동/선택/취소. 처리한 키는 전역 단축키(Space=입력 등)로 새지 않게 막는다.
      const len = historyRef.current.length;
      const cur = switcherIndexRef.current;
      switch (e.key) {
        case "Tab":
          e.preventDefault();
          e.stopPropagation();
          setSwitcherIdx((cur + (e.shiftKey ? -1 : 1) + len) % len);
          scheduleCommit();
          break;
        case "s":
        case "S":
          e.preventDefault();
          e.stopPropagation();
          setSwitcherIdx((cur + 1) % len);
          scheduleCommit();
          break;
        case "w":
        case "W":
          e.preventDefault();
          e.stopPropagation();
          setSwitcherIdx((cur - 1 + len) % len);
          scheduleCommit();
          break;
        case " ":
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          commitSwitcher(cur);
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closeSwitcher();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [inputOpen, settingsOpen, scheduleCommit, closeSwitcher, commitSwitcher, setSwitcherIdx]);

  // 입력 대상 tradeTime = 현재 마커 위치(분 → "HH:MM").
  const markerTimeStr = minutesToTimeString(markerMinutes);
  const canDeletePoint = Boolean(activePoint.reviewId);

  const handleDeletePoint = async () => {
    if (!activePoint.reviewId) return;
    if (!window.confirm(`이 타점(${formatPointTime(activePoint.tradeTime)})을 삭제할까요?`)) return;
    try {
      const res = await fetch("/api/review/point", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: activePoint.reviewId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // 전역 단축키: q/e=종목, a/d=마커(연타=1시간), Ctrl+a/d=타점, w/s=테마 종목,
  // z=뷰 순환, c=본 종목 복귀, Space=입력 드로어.
  // 모달이 열려 있는 동안에는(enabled=false) 무시한다.
  useGlobalShortcuts({
    enabled: !inputOpen && !settingsOpen && !switcherOpen,
    onPrevGroup: commands.prevGroup,
    onNextGroup: commands.nextGroup,
    onMarkerLeft: handleMarkerLeft,
    onMarkerRight: handleMarkerRight,
    onShiftMarkerLeft: handleShiftMarkerLeft,
    onShiftMarkerRight: handleShiftMarkerRight,
    onPrevPoint: handlePrevPoint,
    onNextPoint: handleNextPoint,
    onThemeUp: handleThemeUp,
    onThemeDown: handleThemeDown,
    onCycleView: cycleView,
    onResetOverride: resetOverride,
    onOpenInput: openInput,
    onWriteAppend: handleWriteAppend,
  });

  const header = (
    <ReviewHeader
      commands={commands}
      displayName={activeReview?.stockName ?? effectiveStock.stockName ?? effectiveStock.stockCode}
      tradeDate={effectiveStock.tradeDate}
      themeName={selectedThemeName}
      point={activePoint}
      groupIndex={navPosition}
      groupCount={navCount}
      viewMode={viewMode}
      isOverride={isOverride}
      onResetOverride={() => setChartOverride(null)}
      headerAvailable={headerAvailable}
      onOpenSettings={() => setSettingsOpen(true)}
      markerMinutes={markerMinutes}
      onMarkerMinutesChange={setMarkerMinutes}
      hasSpreadsheet={hasSpreadsheet}
      readTab={readTab}
      writeTab={writeTab}
      tabs={tabs}
      onCycleReadTab={handleCycleReadTab}
      onCycleWriteTab={handleCycleWriteTab}
    />
  );

  const toast = writeAppendStatus && (
    <div
      className={`${styles.appendToast} ${writeAppendStatus.startsWith("✓") ? styles.appendToastOk : styles.appendToastErr}`}
    >
      {writeAppendStatus}
    </div>
  );

  const sidebar = (
    <aside className={styles.sidebar}>
      <div className={styles.themeSlot}>
        <ThemeSidebar
          themes={themes}
          markerTime={markerTime}
          priceMode={priceMode}
          selectedThemeId={selectedThemeId}
          onSelectTheme={setSelectedThemeId}
          selfStockCode={effectiveStock.stockCode}
          onSelectStock={handleSelectStock}
          isLoading={chartPreview.isLoading}
          error={chartPreview.error}
        />
      </div>
      <div className={styles.pointSlot}>
        <PointListToolbar
          onInput={openInput}
          onDelete={handleDeletePoint}
          canDelete={canDeletePoint}
          canInput={canInput}
        />
        <PointList
          points={activeGroup.points}
          selectedPointKey={activePoint.pointKey}
          onSelectPoint={isOverride ? handleSelectExploredPoint : commands.selectPoint}
        />
      </div>
    </aside>
  );

  const settingsModal = settingsOpen && (
    <SettingsModal
      manualFieldKeys={manualFieldKeys}
      headerAvailable={headerAvailable}
      valueSuggestions={valueSuggestions}
      onClose={() => setSettingsOpen(false)}
    />
  );

  const inputDrawer = inputOpen && (
    <PointInputDrawer
      stockCode={activeGroup.stockCode}
      stockName={activeGroup.stockName}
      tradeDate={activeGroup.tradeDate}
      tradeTime={markerTimeStr}
      points={activeGroup.points}
      manualKeys={manualKeys}
      valueSuggestions={valueSuggestions}
      onClose={() => setInputOpen(false)}
      onSaved={() => {
        setInputOpen(false);
        router.refresh();
      }}
    />
  );

  const historySwitcher = switcherOpen && (
    <HistorySwitcher
      entries={history}
      activeIndex={switcherIndex}
      currentKey={`${selectedGroup.stockCode}-${selectedGroup.tradeDate}`}
      onPick={commitSwitcher}
    />
  );

  if (viewMode === "minute") {
    return (
      <main className={styles.workspace}>
        {header}
        {settingsModal}
        {inputDrawer}
        {historySwitcher}
        {toast}
        <section className={styles.singleMode}>
          <MinuteChartPanel
            data={mainChartData}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            markerTime={markerTime}
            group={activeGroup}
            point={activePoint}
            themeOverlay={activeThemeOverlay}
            priceLines={dailyPriceLines}
          />
        </section>
      </main>
    );
  }

  if (viewMode === "daily") {
    return (
      <main className={styles.workspace}>
        {header}
        {settingsModal}
        {inputDrawer}
        {historySwitcher}
        {toast}
        <section className={styles.singleMode}>
          <DailyChartPanel
            data={mainChartData}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            group={activeGroup}
            point={activePoint}
            priceLines={dailyPriceLines}
          />
        </section>
      </main>
    );
  }

  if (viewMode === "overlay") {
    return (
      <main className={styles.workspace}>
        {header}
        {settingsModal}
        {inputDrawer}
        {historySwitcher}
        {toast}
        <section className={styles.singleMode}>
          <div className={styles.chartPanel}>
            <RealThemeOverlayChart
              data={activeThemeOverlay}
              markerTime={markerTime}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.workspace}>
      {header}
      {settingsModal}
      {inputDrawer}
      {historySwitcher}
      {toast}
      <section className={styles.body}>
        {sidebar}
        <section className={styles.mainPane}>
          <div className={styles.chartCell}>
            <DailyChartPanel
              data={mainChartData}
              isLoading={chartPreview.isLoading}
              error={chartPreview.error}
              group={activeGroup}
              point={activePoint}
              priceLines={dailyPriceLines}
            />
          </div>
          <div className={styles.chartCell}>
            <MinuteChartPanel
              data={mainChartData}
              isLoading={chartPreview.isLoading}
              error={chartPreview.error}
              markerTime={markerTime}
              group={activeGroup}
              point={activePoint}
              themeOverlay={activeThemeOverlay}
              priceLines={dailyPriceLines}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

type ReviewHeaderProps = {
  commands: ReturnType<typeof createReviewCommands>;
  displayName: string;
  tradeDate: string;
  themeName: string | null;
  point: ReviewPoint;
  groupIndex: number;
  groupCount: number;
  viewMode: ReviewViewMode;
  isOverride: boolean;
  onResetOverride: () => void;
  headerAvailable: string[];
  onOpenSettings: () => void;
  markerMinutes: number;
  onMarkerMinutesChange: (m: number) => void;
  hasSpreadsheet: boolean;
  readTab: string;
  writeTab: string | null;
  tabs: string[];
  onCycleReadTab: () => void;
  onCycleWriteTab: () => void;
};

function ReviewHeader({
  commands,
  displayName,
  tradeDate,
  themeName,
  point,
  groupIndex,
  groupCount,
  viewMode,
  isOverride,
  onResetOverride,
  headerAvailable,
  onOpenSettings,
  markerMinutes,
  onMarkerMinutesChange,
  hasSpreadsheet,
  readTab,
  writeTab,
  tabs,
  onCycleReadTab,
  onCycleWriteTab,
}: ReviewHeaderProps) {
  const chartPriceMode = useUiStore((state) => state.chartPriceMode);
  const setChartPriceMode = useUiStore((state) => state.setChartPriceMode);
  const headerFieldKeys = useUiStore((state) => state.headerFieldKeys);

  const fieldValues = headerFieldKeys
    .filter((key) => headerAvailable.includes(key))
    .map((key) => ({ key, value: resolveFieldValue(key, point) }));

  const viewLabel = VIEW_MODES.find((v) => v.mode === viewMode)?.label ?? viewMode;

  return (
    <header className={styles.header}>
      <div className={styles.headerInfo}>
        <div className={styles.titleLine}>
          <span className={styles.stockName}>{displayName}</span>
          {isOverride && (
            <button type="button" className={styles.overrideTag} onClick={onResetOverride}>
              탐색중 · 본 종목으로 ✕
            </button>
          )}
          <span className={styles.sep}>|</span>
          <span className="tabular">{tradeDate}</span>
          <span className={styles.sep}>|</span>
          <span>{themeName ?? "테마 -"}</span>
          <span className={styles.sep}>|</span>
          <TimeSlider minutes={markerMinutes} onMinutesChange={onMarkerMinutesChange} />
        </div>
        <div className={styles.fieldLine}>
          {fieldValues.length === 0 ? (
            <span className={styles.fieldHint}>⚙ 설정에서 표시할 필드를 선택하세요</span>
          ) : (
            fieldValues.map(({ key, value }) => (
              <span key={key} className={styles.fieldItem} title={value || "-"}>
                <span className={styles.fieldKey}>{key}</span>
                <span className={styles.fieldVal}>{value ? truncate(value, VALUE_TRUNCATE) : "-"}</span>
              </span>
            ))
          )}
        </div>
      </div>
      <div className={styles.headerRight}>
        <div className={styles.controls}>
          {/* 탭 순환 버튼 (시트가 설정된 경우에만) */}
          {hasSpreadsheet && (
            <div className={styles.segGroup}>
              <button
                type="button"
                className={`${styles.segChip} ${styles.segChipActive}`}
                onClick={onCycleReadTab}
                title={tabs.length > 1 ? "클릭: 다음 읽기 탭으로 전환" : "읽기 탭"}
              >
                {readTab}
              </button>
              <span className={styles.segArrow}>→</span>
              <button
                type="button"
                className={`${styles.segChip} ${writeTab ? styles.segChipActive : ""}`}
                onClick={onCycleWriteTab}
                title={tabs.length > 0 ? "클릭: 다음 쓰기 탭으로 전환" : "쓰기 탭 미설정"}
              >
                {writeTab ?? "미설정"}
              </button>
            </div>
          )}
          {/* 종목 이동 */}
          <span className={styles.navGroup} title="화살표로 종목 이동">
            <button
              className={styles.navArrow}
              type="button"
              onClick={commands.prevGroup}
              disabled={groupIndex === 0}
              title="이전 종목"
            >
              ←
            </button>
            <span className={`${styles.navPos} tabular`}>
              {groupIndex < 0 ? "-" : groupIndex + 1}/{groupCount}
            </span>
            <button
              className={styles.navArrow}
              type="button"
              onClick={commands.nextGroup}
              disabled={groupIndex === groupCount - 1}
              title="다음 종목"
            >
              →
            </button>
          </span>
          {/* 가격 모드: 클릭으로 KRX ↔ NXT 전환 */}
          <div className={styles.segGroup}>
            <button
              className={`${styles.segChip} ${styles.segChipActive}`}
              type="button"
              onClick={() => setChartPriceMode(chartPriceMode === "krx" ? "nxt" : "krx")}
              title={`현재 ${chartPriceMode.toUpperCase()} · 클릭: 전환`}
            >
              {chartPriceMode.toUpperCase()}
            </button>
          </div>
          {/* 뷰 모드: 클릭으로 순환 */}
          <div className={styles.segGroup}>
            <button
              className={`${styles.segChip} ${styles.segChipActive}`}
              type="button"
              onClick={() => commands.setViewMode(cycleViewMode(viewMode, 1))}
              title={`현재 ${viewLabel} · 클릭: 다음 뷰로 전환`}
            >
              {viewLabel}
            </button>
          </div>
          {/* 설정 */}
          <div className={styles.segGroup}>
            <button type="button" className={styles.segChip} onClick={onOpenSettings} title="설정">
              ⚙
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function normalizeTradeTime(tradeTime: string) {
  return tradeTime.length === 5 ? `${tradeTime}:00` : tradeTime;
}

/** 값이 delayMs 동안 안정되면 반영하는 디바운스 훅. 첫 값은 즉시 반영. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * 붙여넣은 텍스트에서 GroupId(종목코드 + 거래일)를 관대하게 파싱.
 * "005930-2026-05-27", "005930 20260527", "005930_2026/05/27" 등 허용.
 */
function parseGroupId(text: string): { code: string; date: string } | null {
  // 종목코드는 6자리 영숫자(예: 0126Z0, 0009K0). 숫자만이 아님에 주의.
  const m = text.trim().match(/([0-9A-Za-z]{6})\D*(\d{4})\D?(\d{2})\D?(\d{2})/);
  if (!m) return null;
  return { code: m[1].toUpperCase(), date: `${m[2]}-${m[3]}-${m[4]}` };
}

/** "9010 | 9450" 형태의 파이프 구분 문자열을 유효한 양수 가격 배열로 파싱. */
function parseLineTargets(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((token) => Number(token.replace(/[^0-9.-]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/** 전 그룹의 manual / feature 키를 모아 정렬. manual 은 m_ 접두 라벨로 변환. */
function collectFieldKeys(groups: ReviewStockGroup[]) {
  const manual = new Set<string>();
  const feature = new Set<string>();
  for (const group of groups) {
    for (const point of group.points) {
      for (const key of Object.keys(point.sourceRow.manual)) manual.add(`m_${key}`);
      for (const key of Object.keys(point.sourceRow.features)) {
        if (key === "amountText") continue;
        feature.add(key);
      }
    }
  }
  return {
    manualFieldKeys: Array.from(manual).sort(),
    featureFieldKeys: Array.from(feature).sort(),
  };
}

/** 전 그룹 manual 값을 키별 distinct 목록으로 수집 (입력 드로어 추천용). " | " 분해. */
function collectValueSuggestions(groups: ReviewStockGroup[]): Record<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const point of group.points) {
      for (const [key, raw] of Object.entries(point.sourceRow.manual)) {
        if (!raw) continue;
        const set = byKey.get(key) ?? new Set<string>();
        for (const token of raw.split("|")) {
          const value = token.trim();
          if (value) set.add(value);
        }
        byKey.set(key, set);
      }
    }
  }
  const result: Record<string, string[]> = {};
  for (const [key, set] of byKey) result[key] = Array.from(set).sort();
  return result;
}

/** 필드 키 → 현재 타점의 값. stockCode/tradeDate/tradeTime/stockName/groupId + m_xxx + feature 지원. */
function resolveFieldValue(key: string, point: ReviewPoint): string {
  if (key === "stockCode") return point.sourceRow.stockCode ?? "";
  if (key === "tradeDate") return point.sourceRow.tradeDate ?? "";
  if (key === "tradeTime") return point.tradeTime?.slice(0, 5) ?? "";
  if (key === "stockName") return point.sourceRow.stockName ?? "";
  if (key === "groupId") return `${point.sourceRow.stockCode ?? ""}-${point.sourceRow.tradeDate ?? ""}`;
  if (key.startsWith("m_")) return point.sourceRow.manual[key.slice(2)]?.trim() ?? "";
  return point.sourceRow.features[key]?.trim() ?? "";
}

type PointListToolbarProps = {
  onInput: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canInput: boolean;
};

function PointListToolbar({ onInput, onDelete, canDelete, canInput }: PointListToolbarProps) {
  const manualFilters = useUiStore((state) => state.manualFilters);
  const activeFilters = activeFilterCount(manualFilters);
  return (
    <div className={styles.pointToolbar}>
      <span className={styles.pointToolbarLabel}>
        Point List
        {activeFilters > 0 && (
          <span className={styles.pointMatchBadge} title="활성 m_ 필터 수">
            필터 {activeFilters}
          </span>
        )}
      </span>
      <div className={styles.pointActions}>
        <button
          type="button"
          className={styles.pointAddBtn}
          onClick={onInput}
          disabled={!canInput}
          title={canInput ? "타점 입력" : "review_target 종목만 입력 가능"}
        >
          + 입력
        </button>
        <button
          type="button"
          className={styles.pointDelBtn}
          onClick={onDelete}
          disabled={!canDelete}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

type PointListProps = {
  points: ReviewPoint[];
  selectedPointKey: string;
  onSelectPoint: (pointKey: string) => void;
};

function PointList({ points, selectedPointKey, onSelectPoint }: PointListProps) {
  const pointFieldKeys = useUiStore((state) => state.pointFieldKeys);
  const manualFilters = useUiStore((state) => state.manualFilters);
  const filterActive = activeFilterCount(manualFilters) > 0;

  return (
    <div className={styles.pointList}>
      {points.map((point) => {
        const isActive = point.pointKey === selectedPointKey;
        const fields = pointFieldKeys.map((key) => ({ key, value: resolveFieldValue(key, point) }));
        const matched = filterActive && pointMatchesManualFilters(point, manualFilters);

        return (
          <button
            key={point.pointKey}
            className={`${styles.pointItem} ${isActive ? styles.pointItemActive : ""}`}
            type="button"
            onClick={() => onSelectPoint(point.pointKey)}
          >
            <span className={styles.pointTime}>
              <span className={styles.pointDot}>●</span>
              <span className="tabular">{formatPointTime(point.tradeTime)}</span>
            </span>
            <div className={styles.pointVals}>
              {matched && (
                <span className={styles.pointMatchBadge} title="필터 매칭">
                  필터
                </span>
              )}
              {point.amountText && (
                <span className={styles.pointAmount} title={point.amountText}>
                  {point.amountText}
                </span>
              )}
              {fields.map(({ key, value }) => (
                <span
                  key={key}
                  className={value ? styles.pointFieldVal : styles.pointFieldEmpty}
                  title={value || "-"}
                >
                  {value ? truncate(value, VALUE_TRUNCATE) : "-"}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

type ChartPreviewData = ReturnType<typeof useChartPreview>["data"];

type ChartPanelProps = {
  data: ChartPreviewData;
  isLoading: boolean;
  error: Error | null;
  group: ReviewStockGroup;
  point: ReviewPoint;
};

type MinuteChartPanelProps = ChartPanelProps & {
  markerTime: number | null;
  themeOverlay?: ChartOverlaySeries[];
  priceLines?: Record<string, number[]>;
};

function MinuteChartPanel({
  data,
  isLoading,
  error,
  markerTime,
  group,
  point,
  themeOverlay,
  priceLines,
}: MinuteChartPanelProps) {
  if (isLoading) {
    return <ChartPlaceholder kind="Minute Chart" group={group} point={point} message="Loading minute candles..." />;
  }
  if (error) {
    return <ChartPlaceholder kind="Minute Chart" group={group} point={point} message={error.message} />;
  }
  if (!data || data.minute.length === 0) {
    return <ChartPlaceholder kind="Minute Chart" group={group} point={point} message="No minute candles found." />;
  }

  return (
    <div className={styles.chartPanel}>
      <RealMinuteChart
        candles={data.minute}
        markerTime={markerTime}
        themeOverlay={themeOverlay ?? []}
        priceLines={priceLines}
        prevCloseKrx={data.prevCloseKrx}
        prevCloseNxt={data.prevCloseNxt}
      />
    </div>
  );
}

type DailyChartPanelProps = ChartPanelProps & {
  priceLines?: Record<string, number[]>;
};

function DailyChartPanel({ data, isLoading, error, group, point, priceLines }: DailyChartPanelProps) {
  if (isLoading) {
    return <ChartPlaceholder kind="Daily Chart" group={group} point={point} message="Loading daily candles..." />;
  }
  if (error) {
    return <ChartPlaceholder kind="Daily Chart" group={group} point={point} message={error.message} />;
  }
  if (!data || data.daily.length === 0) {
    return <ChartPlaceholder kind="Daily Chart" group={group} point={point} message="No daily candles found." />;
  }

  return (
    <div className={styles.chartPanel}>
      <RealDailyChart candles={data.daily} priceLines={priceLines} />
    </div>
  );
}

type ChartPlaceholderProps = {
  kind: string;
  group: ReviewStockGroup;
  point: ReviewPoint;
  message?: string;
};

function ChartPlaceholder({ kind, group, point, message }: ChartPlaceholderProps) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderInner}>
        <div>
          <div className={styles.placeholderTitle}>{kind}</div>
          <div className={styles.placeholderSub}>
            {group.stockName ?? group.stockCode} {group.tradeDate} {formatPointTime(point.tradeTime)}
          </div>
        </div>
        <div className={styles.placeholderSub}>
          {message ?? "This view remains a placeholder in the current phase."}
        </div>
      </div>
    </div>
  );
}

function formatPointTime(tradeTime: string) {
  return tradeTime || "미입력";
}

