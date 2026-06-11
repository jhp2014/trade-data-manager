"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./ReviewWorkspace.module.css";
import { RealThemeOverlayChart } from "@/components/chart/RealThemeOverlayChart";
import { MinuteChartPanel, DailyChartPanel } from "./ChartPanels";
import { ReviewHeader } from "./ReviewHeader";
import { PointListToolbar, PointList } from "./PointList";
import { ThemeSidebar } from "./ThemeSidebar";
import { SettingsModal } from "./modals/SettingsModal";
import { activeFilterCount, pointMatchesManualFilters } from "@/lib/manualFilter";
import { timeStringToMinutes } from "./TimeSlider";
import { createReviewCommands } from "@/lib/reviewCommands";
import { isEditableTarget } from "@/lib/domFocus";
import { postJson, deleteJson } from "@/lib/apiClient";
import { dateToUnix } from "@/lib/serialization";
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
import { PresetSwitcher } from "./PresetSwitcher";
import { buildExploredGroup } from "@/lib/buildExploredGroup";
import { CHART_PARAMS_DEBOUNCE_MS, PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK } from "@/lib/constants";
import { VIEW_MODES, MARKER_HOUR_STEP_MIN, cycleViewMode } from "@/lib/shortcuts";
import { computeThemeMemberMetrics, topByRate } from "@/lib/themeMetrics";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useHistorySwitcher } from "@/hooks/useHistorySwitcher";
import { useMarkerTime } from "@/hooks/useMarkerTime";
import { useStatusToast } from "@/hooks/useStatusToast";
import { useQuickPresets } from "@/hooks/useQuickPresets";
import { useTabNavigation } from "@/hooks/useTabNavigation";
import { useManualKeyRegistry } from "@/hooks/useManualKeyRegistry";
import { useWorkingSetCache } from "@/hooks/useWorkingSetCache";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  VALUE_TRUNCATE,
  parseGroupId,
  parseLineTargets,
  collectFieldKeys,
  collectValueSuggestions,
  resolveFieldValue,
  formatPointTime,
} from "@/lib/reviewFields";

type ReviewWorkspaceProps = {
  groups: ReviewStockGroup[];
  initialSelection: InitialReviewSelection;
  manualKeys: ManualKeyDef[];
  /** 현재 읽기 시트 탭 이름(RSC 에서 전달). 탭 칩 초기화용. */
  initialTab: string;
  /** 스프레드시트가 설정돼 있는지. false 면 시트 탭 칩을 표시하지 않는다. */
  hasSpreadsheet: boolean;
  /** 초기 읽기 소스: "sheet" = 시트 탭, "db" = DB 전체. */
  initialReadSource?: "sheet" | "db";
};

export function ReviewWorkspace({
  groups: initialGroups,
  initialSelection,
  manualKeys: manualKeysProp,
  initialTab,
  hasSpreadsheet,
  initialReadSource = "sheet",
}: ReviewWorkspaceProps) {
  const router = useRouter();

  // 레지스트리(m_ 키) 목록과 낙관적 추가/삭제/이름변경은 useManualKeyRegistry 로 분리.
  const { manualKeys, addManualKeyLocal, removeManualKeyLocal, renameManualKeyLocal } =
    useManualKeyRegistry(manualKeysProp);
  const manualFilters = useUiStore((state) => state.manualFilters);
  const filterActive = activeFilterCount(manualFilters) > 0;
  const writeTab = useUiStore((state) => state.writeTab);
  const setWriteTab = useUiStore((state) => state.setWriteTab);
  const exportFieldKeys = useUiStore((state) => state.exportFieldKeys);
  const tabPositions = useUiStore((state) => state.tabPositions);
  const setTabPosition = useUiStore((state) => state.setTabPosition);
  const cycleTabList = useUiStore((state) => state.cycleTabList);
  const quickPresetGroups = useUiStore((state) => state.quickPresetGroups);

  // 탭별 작업셋 캐시. initialGroups 는 초기 탭의 데이터로 전달한다.
  const {
    tabs,
    readTab,
    groups,
    isLoadingWorkset,
    readSource,
    switchTab,
    switchToDb,
    reloadTab,
    reloadAll,
    upsertPointLocal,
    removePointLocal,
    purgeManualKeyLocal: purgeManualKeyFromWorkset,
    renameManualKeyLocal: renameManualKeyInWorkset,
  } = useWorkingSetCache(initialGroups, initialTab, initialReadSource);

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

  // 읽기/쓰기 탭 전환·재조회 핸들러(위치 저장/복원 포함)는 useTabNavigation 으로 분리.
  const {
    handleCycleSheetTab,
    handleToggleDbMode,
    handleCycleWriteTab,
    handleReloadTab,
    handleReloadAll,
  } = useTabNavigation({
    readSource,
    readTab,
    tabs,
    writeTab,
    setWriteTab,
    cycleTabList,
    storeGroupIndex,
    storePointKey,
    tabPositions,
    setTabPosition,
    switchTab,
    switchToDb,
    reloadTab,
    reloadAll,
    refreshRouter: () => router.refresh(),
  });

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

  // 마커 시간(분) 상태/파생값/이동은 useMarkerTime 으로 분리.
  // 휠(Shift)/a·d·클릭으로 조정하되 타점이 바뀔 때만 타점 시각으로 재설정한다.
  const {
    markerMinutes,
    setMarkerMinutes,
    markerTime,
    markerTimeStr,
    moveMarker,
    handleMoveMarkerToTime,
  } = useMarkerTime({
    pointTradeTime: selectedPoint.tradeTime,
    pointKey: selectedPoint.pointKey,
    tradeDate: effectiveStock.tradeDate,
  });

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
  // manual 키는 레지스트리(전역 m_ 등록부) + 데이터 파생 키의 합집합으로 둔다.
  // → 아직 데이터가 없는 새 m_ 키도 설정(헤더/Point List/순서/프리셋)에 노출된다.
  const { manualFieldKeys, featureFieldKeys } = useMemo(() => {
    const collected = collectFieldKeys(groups);
    const registryManual = manualKeys.map((k) => `m_${k.key}`);
    const merged = Array.from(
      new Set([...registryManual, ...collected.manualFieldKeys]),
    ).sort();
    return { manualFieldKeys: merged, featureFieldKeys: collected.featureFieldKeys };
  }, [groups, manualKeys]);

  // 자가치유: 레지스트리∪데이터에 살아있는 m_ 키 기준으로, 영속 설정(useUiStore)에 남은
  // 죽은 m_ 키 잔재(내보내기/프리셋/헤더/필터 등)를 제거한다.
  // - manualFieldKeys 는 "m_" 접두사 포함 → 접두사를 떼어 원본 키 집합으로 만든다.
  // - 비어 있으면(DB 미연결/키 없음) 전체를 날릴 위험이 있어 건너뛴다.
  const reconcileManualKeys = useUiStore((state) => state.reconcileManualKeys);
  const liveManualRawKeys = useMemo(
    () => manualFieldKeys.map((k) => (k.startsWith("m_") ? k.slice(2) : k)),
    [manualFieldKeys],
  );
  const liveManualRawKey = liveManualRawKeys.join(" ");
  useEffect(() => {
    if (liveManualRawKeys.length === 0) return;
    reconcileManualKeys(liveManualRawKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveManualRawKey]);
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
    // 상장일이면 전일종가가 없으므로 당일 첫 분봉 시가를 % 기준값으로 대체.
    const baseFallback = activeReview.isListingDay ? activeReview.firstMinuteOpen : null;
    return {
      ...data,
      daily: activeReview.daily,
      minute: activeReview.minute,
      prevCloseKrx: entryCandle?.prevCloseKrx ?? baseFallback,
      prevCloseNxt: entryCandle?.prevCloseNxt ?? baseFallback,
      isListingDay: activeReview.isListingDay,
    };
  }, [chartPreview.data, isOverride, activeReview, effectiveStock.tradeDate]);

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

  // 활성 타점 선택의 단일 진입점. override 면 탐색 선택(작업셋 store 미변경 → a/d 복귀 유지),
  // 아니면 작업셋 선택. 어느 경우든 마커를 그 타점 시각으로 항상 스냅한다.
  // (이미 선택된 타점을 다시 골라도, 또는 선택이 경계라 안 바뀌어도 마커는 복귀한다.)
  const selectActivePoint = useCallback(
    (pointKey: string) => {
      if (isOverride) setExploredPointKey(pointKey);
      else commands.selectPoint(pointKey);
      const p = activeGroup.points.find((x) => x.pointKey === pointKey);
      const mins = p ? timeStringToMinutes(p.tradeTime) : null;
      if (mins != null) setMarkerMinutes(mins);
    },
    [isOverride, commands, activeGroup, setMarkerMinutes],
  );

  // Point List 클릭 핸들러(= 활성 타점 선택).
  const handleSelectPoint = selectActivePoint;

  // 현재 타점에서 dir(과거/미래)로 한 칸 이동. wrap=true 면 끝에서 처음으로 순환.
  // Ctrl+a/d(이동)와 분봉 우클릭(순회) 공용.
  const stepPoint = useCallback(
    (dir: 1 | -1, wrap = false) => {
      const pts = activeGroup.points;
      if (pts.length === 0) return;
      const curIdx = pts.findIndex((p) => p.pointKey === activePoint.pointKey);
      const base = curIdx < 0 ? 0 : curIdx;
      const nextIdx = wrap
        ? (base + dir + pts.length) % pts.length
        : Math.min(pts.length - 1, Math.max(0, base + dir));
      selectActivePoint(pts[nextIdx].pointKey);
    },
    [activeGroup, activePoint.pointKey, selectActivePoint],
  );

  // 분봉 우클릭 → 다음 타점으로 순회(끝에서 처음으로 래핑).
  const cyclePoint = useCallback(() => stepPoint(1, true), [stepPoint]);

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

  // 짧게 떴다 사라지는 상태 토스트(f 추가/프리셋 적용 결과 공용).
  const { status: writeAppendStatus, showStatus } = useStatusToast();

  // f 키: Write Tab 마지막 행에 현재 탐색 종목 데이터를 추가한다.
  // 낙관적: 키 입력 즉시 피드백(토스트/히스토리)하고, 실제 Sheets append 는
  // 백그라운드로 보낸다. 실패하면 토스트를 에러로 교체한다.
  const handleWriteAppend = useCallback(() => {
    if (!writeTab) return;
    const headers = exportFieldKeys;
    const values = headers.map((key) => resolveFieldValue(key, activePoint));
    const label = effectiveStock.stockName ?? effectiveStock.stockCode;

    pushHistory({
      stockCode: effectiveStock.stockCode,
      tradeDate: effectiveStock.tradeDate,
      stockName: effectiveStock.stockName ?? undefined,
    });
    showStatus(`✓ ${label} 추가됨`);

    void postJson("/api/review/write-sheet/append", { writeTab, headers, values }, "append 실패")
      .catch((err) => {
        showStatus(`✗ ${err instanceof Error ? err.message : "오류"}`);
      });
  }, [writeTab, exportFieldKeys, activePoint, effectiveStock, pushHistory, showStatus]);

  // 쓰기 탭 초기화: 탭을 비우고 첫 행에 헤더를 기록한다(시트를 수동으로 다 지운 뒤 재시작용).
  const handleInitWriteTab = useCallback(async () => {
    if (!writeTab) return;
    const headers = exportFieldKeys;
    if (headers.length === 0) {
      showStatus("✗ 내보낼 필드(헤더)가 없습니다");
      return;
    }
    if (!window.confirm(`쓰기 탭 '${writeTab}'을 초기화하고 첫 행에 헤더를 기록할까요?\n기존 내용은 모두 지워집니다.`)) {
      return;
    }
    try {
      await postJson("/api/review/write-sheet/init-header", { writeTab, headers }, "초기화 실패");
      showStatus(`✓ '${writeTab}' 초기화됨`);
    } catch (err) {
      showStatus(`✗ ${err instanceof Error ? err.message : "오류"}`);
    }
  }, [writeTab, exportFieldKeys, showStatus]);

  // KRX/NXT 토글.
  const setPriceMode = useUiStore((state) => state.setChartPriceMode);
  const handleTogglePriceMode = useCallback(() => {
    setPriceMode(priceMode === "krx" ? "nxt" : "krx");
  }, [priceMode, setPriceMode]);

  // x: 분봉 마커 중심 확대 ↔ 기본 뷰 토글. 종목/날짜가 바뀌면 기본 뷰로 리셋.
  const [minuteZoomed, setMinuteZoomed] = useState(false);
  const handleToggleMinuteZoom = useCallback(() => setMinuteZoomed((z) => !z), []);
  useEffect(() => {
    setMinuteZoomed(false);
  }, [effectiveStock.stockCode, effectiveStock.tradeDate]);

  // useGlobalShortcuts 가 받는 무인자 콜백 어댑터(방향/스텝 인자 고정).
  const handleMarkerLeft = useCallback(() => moveMarker(-1), [moveMarker]);
  const handleMarkerRight = useCallback(() => moveMarker(1), [moveMarker]);
  const handleShiftMarkerLeft = useCallback(() => moveMarker(-1, MARKER_HOUR_STEP_MIN), [moveMarker]);
  const handleShiftMarkerRight = useCallback(() => moveMarker(1, MARKER_HOUR_STEP_MIN), [moveMarker]);
  const handlePrevPoint = useCallback(() => stepPoint(-1), [stepPoint]);
  const handleNextPoint = useCallback(() => stepPoint(1), [stepPoint]);
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
      if (isEditableTarget(e.target)) return;
      const parsed = parseGroupId(e.clipboardData?.getData("text") ?? "");
      if (!parsed) return;
      e.preventDefault();
      navigateToGroupId(parsed.code, parsed.date);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [inputOpen, settingsOpen, navigateToGroupId]);

  // Tab 히스토리 스위처(상태/키 핸들링은 useHistorySwitcher 로 분리).
  const { switcherOpen, switcherIndex, commitSwitcher, deleteEntry, clearAll } = useHistorySwitcher({
    history,
    selectedGroupKey: `${selectedGroup.stockCode}-${selectedGroup.tradeDate}`,
    inputOpen,
    settingsOpen,
    navigateToGroupId,
  });

  const canDeletePoint = Boolean(activePoint.reviewId);

  const handleDeletePoint = async () => {
    if (!activePoint.reviewId) return;
    if (!window.confirm(`이 타점(${formatPointTime(activePoint.tradeTime)})을 삭제할까요?`)) return;
    const deletedId = activePoint.reviewId;
    try {
      await deleteJson("/api/review/point", { reviewId: deletedId }, "삭제 실패");
      // 낙관적: 서버 재조회 없이 화면에서 즉시 제거.
      removePointLocal(deletedId);
      // 삭제된 타점이 선택돼 있었으므로 같은 그룹의 다른 타점으로 이동(남은 게 있으면).
      const remaining = activeGroup.points.filter((p) => p.reviewId !== deletedId);
      if (remaining.length > 0) {
        useReviewStore.getState().hydrateSelection({
          selectedGroupIndex,
          selectedPointKey: remaining[0].pointKey,
        });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // 퀵 입력 프리셋(상태/키 핸들링/적용 로직은 useQuickPresets 로 분리).
  const { presetGroupOpen, presetIndex, applyPreset, closePresetGroup } = useQuickPresets({
    canInput,
    activeGroup,
    markerTimeStr,
    markerMinutes,
    inputOpen,
    settingsOpen,
    switcherOpen,
    quickPresetGroups,
    upsertPointLocal,
    showStatus,
  });

  // 전역 단축키: q/e=종목, a/d=마커(연타=1시간), Ctrl+a/d=타점, w/s=테마 종목,
  // z=뷰 순환, c=본 종목 복귀, Space=입력 드로어, x=분봉 마커 중심 확대 토글.
  // 모달이 열려 있는 동안에는(enabled=false) 무시한다.
  useGlobalShortcuts({
    enabled: !inputOpen && !settingsOpen && !switcherOpen && presetGroupOpen === null,
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
    onCycleReadTab: handleCycleSheetTab,
    onTogglePriceMode: handleTogglePriceMode,
    onToggleMinuteZoom: handleToggleMinuteZoom,
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
      isListingDay={mainChartData?.isListingDay ?? false}
      onResetOverride={() => setChartOverride(null)}
      headerAvailable={headerAvailable}
      onOpenSettings={() => setSettingsOpen(true)}
      markerMinutes={markerMinutes}
      hasSpreadsheet={hasSpreadsheet}
      readTab={readTab}
      readSource={readSource}
      writeTab={writeTab}
      tabs={tabs}
      isLoadingWorkset={isLoadingWorkset}
      onCycleSheetTab={handleCycleSheetTab}
      onToggleDbMode={handleToggleDbMode}
      onCycleWriteTab={handleCycleWriteTab}
      onReloadTab={handleReloadTab}
      onInitWriteTab={handleInitWriteTab}
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
          onSelectPoint={handleSelectPoint}
        />
      </div>
    </aside>
  );

  const settingsModal = settingsOpen && (
    <SettingsModal
      manualFieldKeys={manualFieldKeys}
      headerAvailable={headerAvailable}
      valueSuggestions={valueSuggestions}
      onReloadAll={handleReloadAll}
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
      onKeyAdded={addManualKeyLocal}
      onKeyDeleted={(key) => {
        // 레지스트리 상태 + 작업셋(각 타점 manual) 양쪽에서 제거해야
        // manualFieldKeys(레지스트리∪데이터)에서 즉시 사라진다.
        removeManualKeyLocal(key);
        purgeManualKeyFromWorkset(key);
      }}
      onKeyRenamed={(from, to) => {
        renameManualKeyLocal(from, to);
        renameManualKeyInWorkset(from, to);
      }}
      onSaved={({ reviewId, payload, features }) => {
        setInputOpen(false);
        // 낙관적: 서버 재조회 없이 화면의 해당 타점을 즉시 갱신(서버 파생 features 포함).
        upsertPointLocal({
          stockCode: activeGroup.stockCode,
          tradeDate: activeGroup.tradeDate,
          tradeTime: markerTimeStr,
          reviewId,
          payload,
          features,
        });
      }}
    />
  );

  const historySwitcher = switcherOpen && (
    <HistorySwitcher
      entries={history}
      activeIndex={switcherIndex}
      currentKey={`${selectedGroup.stockCode}-${selectedGroup.tradeDate}`}
      onPick={commitSwitcher}
      onDelete={deleteEntry}
      onClearAll={clearAll}
    />
  );

  const presetGroup = presetGroupOpen
    ? quickPresetGroups.find((g) => g.hotkey === presetGroupOpen) ?? null
    : null;
  const presetSwitcher = presetGroup && presetGroup.presets.length > 0 && (
    <PresetSwitcher
      group={presetGroup}
      activeIndex={presetIndex}
      targetLabel={`${activeGroup.stockName ?? activeGroup.stockCode} ${markerTimeStr}`}
      onPick={(preset) => {
        void applyPreset(preset);
        closePresetGroup();
      }}
    />
  );

  // 헤더·모달·토스트는 모든 뷰모드 공통 → 한 번만 조립한다.
  const chrome = (
    <>
      {header}
      {settingsModal}
      {inputDrawer}
      {historySwitcher}
      {presetSwitcher}
      {toast}
    </>
  );

  // 일봉/분봉 패널은 단일 뷰와 대시보드(2분할)에서 동일하게 쓰이므로 한 번만 만든다.
  const dailyPanel = (
    <DailyChartPanel
      data={mainChartData}
      isLoading={chartPreview.isLoading}
      error={chartPreview.error}
      group={activeGroup}
      point={activePoint}
      priceLines={dailyPriceLines}
    />
  );

  const minutePanel = (
    <MinuteChartPanel
      data={mainChartData}
      isLoading={chartPreview.isLoading}
      error={chartPreview.error}
      markerTime={markerTime}
      group={activeGroup}
      point={activePoint}
      themeOverlay={activeThemeOverlay}
      priceLines={dailyPriceLines}
      zoomed={minuteZoomed}
      onMoveMarkerToTime={handleMoveMarkerToTime}
      onCyclePoint={cyclePoint}
    />
  );

  let body: ReactNode;
  if (viewMode === "minute") {
    body = <section className={styles.singleMode}>{minutePanel}</section>;
  } else if (viewMode === "daily") {
    body = <section className={styles.singleMode}>{dailyPanel}</section>;
  } else if (viewMode === "overlay") {
    body = (
      <section className={styles.singleMode}>
        <div className={styles.chartPanel}>
          <RealThemeOverlayChart data={activeThemeOverlay} markerTime={markerTime} />
        </div>
      </section>
    );
  } else {
    body = (
      <section className={styles.body}>
        {sidebar}
        <section className={styles.mainPane}>
          <div className={styles.chartCell}>{dailyPanel}</div>
          <div className={styles.chartCell}>{minutePanel}</div>
        </section>
      </section>
    );
  }

  return (
    <main className={styles.workspace}>
      {chrome}
      {body}
    </main>
  );
}
