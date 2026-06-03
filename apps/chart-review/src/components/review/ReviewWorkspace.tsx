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
import { composeUnix } from "@/lib/serialization";
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
import { useReviewStore } from "@/stores/useReviewStore";
import { PointInputDrawer } from "./PointInputDrawer";
import { HistorySwitcher } from "./HistorySwitcher";
import { DEFAULT_TRADE_TIME } from "@/lib/url";
import { CHART_PARAMS_DEBOUNCE_MS } from "@/lib/constants";
import {
  VIEW_MODES,
  DEFAULT_MARKER_MINUTES,
  MARKER_WHEEL_STEP_MIN,
  SWITCHER_AUTO_COMMIT_MS,
} from "@/lib/shortcuts";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

type ReviewWorkspaceProps = {
  groups: ReviewStockGroup[];
  initialSelection: InitialReviewSelection;
  manualKeys: ManualKeyDef[];
};

const VALUE_TRUNCATE = 15;

export function ReviewWorkspace({ groups, initialSelection, manualKeys }: ReviewWorkspaceProps) {
  const router = useRouter();
  const manualFilters = useUiStore((state) => state.manualFilters);
  const filterActive = activeFilterCount(manualFilters) > 0;

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
  const priceMode = useUiStore((state) => state.chartPriceMode);

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

  // 필터를 켜거나 바꿨을 때 현재 선택 종목이 매칭 목록 밖이면 첫 매칭 종목으로 스냅.
  useEffect(() => {
    if (!filterActive || navigableIndices.length === 0) return;
    if (navigableIndices.includes(selectedGroupIndex)) return;
    const first = navigableIndices[0];
    const store = useReviewStore.getState();
    store.setSelectedGroupIndex(first);
    store.setSelectedPointKey(groups[first].points[0].pointKey);
  }, [filterActive, navigableIndices, selectedGroupIndex, groups]);

  // 헤더에 표시할 종목 위치/개수: 필터 활성 시 매칭 종목 기준.
  const navPosition = filterActive
    ? Math.max(navigableIndices.indexOf(selectedGroupIndex), 0)
    : selectedGroupIndex;
  const navCount = filterActive ? navigableIndices.length : groups.length;

  // 임시 탐색(override) 중이면 차트/테마 대상은 클릭한 종목, 아니면 리뷰 종목.
  const isOverride = chartOverride != null;
  const effectiveStock = chartOverride ?? {
    stockCode: selectedGroup.stockCode,
    tradeDate: selectedGroup.tradeDate,
    stockName: selectedGroup.stockName,
  };

  const chartParams = useMemo(
    () => ({ stockCode: effectiveStock.stockCode, tradeDate: effectiveStock.tradeDate }),
    [effectiveStock.stockCode, effectiveStock.tradeDate],
  );
  // a/d 로 빠르게 종목을 훑을 때 중간 종목의 차트를 매번 긁어오지 않도록
  // 차트 fetch 파라미터를 200ms 디바운스한다(선택/헤더는 즉시 반영).
  const debouncedChartParams = useDebouncedValue(chartParams, CHART_PARAMS_DEBOUNCE_MS);
  const chartPreview = useChartPreview(debouncedChartParams);
  const themes = useMemo(() => chartPreview.data?.themes ?? [], [chartPreview.data]);

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

  // 일봉 라인 타깃: 리뷰 종목의 features.lineTargets("9010 | 9450")만 표시.
  // 다른 종목을 임시 탐색(override) 중일 때는 표시하지 않는다.
  const dailyPriceLines = useMemo(() => {
    if (isOverride) return undefined;
    const targets = parseLineTargets(selectedPoint.sourceRow.features.lineTargets);
    return targets.length > 0 ? { lineTargets: targets } : undefined;
  }, [isOverride, selectedPoint.sourceRow.features.lineTargets]);

  // 활성 테마의 오버레이 시리즈 (분봉 크로스헤어·테마뷰 공용)
  const activeThemeOverlay = useMemo(() => {
    const theme = themes.find((t) => t.themeId === selectedThemeId) ?? themes[0];
    return theme?.overlaySeries ?? [];
  }, [themes, selectedThemeId]);

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

  const handleSelectStock = (stockCode: string, stockName: string) => {
    if (stockCode === selectedGroup.stockCode) {
      setChartOverride(null);
      return;
    }
    setChartOverride({ stockCode, tradeDate: effectiveStock.tradeDate, stockName });
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const openInput = useCallback(() => setInputOpen(true), []);

  // GroupId 복붙/Tab 히스토리 탐색.
  // 히스토리는 "복붙으로 도달한 종목"만 기록한다(a/d 순회는 기록하지 않음).
  const navigateToGroupId = useCallback(
    (code: string, date: string) => {
      const idx = groups.findIndex((g) => g.stockCode === code && g.tradeDate === date);
      if (idx >= 0) {
        const g = groups[idx];
        pushHistory({ stockCode: g.stockCode, tradeDate: g.tradeDate, stockName: g.stockName ?? undefined });
        commands.goToGroup(idx);
      } else {
        // 현재 로드된 작업셋에 없는 그룹 → 풀 네비게이션으로 폴백.
        router.push(`/review/${code}/${date}/${DEFAULT_TRADE_TIME}`);
      }
    },
    [groups, commands, router, pushHistory],
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
  const canDeletePoint = Boolean(selectedPoint.reviewId);

  const handleDeletePoint = async () => {
    if (!selectedPoint.reviewId) return;
    if (!window.confirm(`이 타점(${formatPointTime(selectedPoint.tradeTime)})을 삭제할까요?`)) return;
    try {
      const res = await fetch("/api/review/point", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selectedPoint.reviewId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // 전역 단축키: a/d=종목, w/s=타점, e/q=뷰 순환, Space=입력 드로어.
  // 모달이 열려 있는 동안에는(enabled=false) 무시한다.
  useGlobalShortcuts({
    commands,
    viewMode,
    enabled: !inputOpen && !settingsOpen && !switcherOpen,
    onOpenInput: openInput,
  });

  const header = (
    <ReviewHeader
      commands={commands}
      displayName={effectiveStock.stockName ?? effectiveStock.stockCode}
      tradeDate={selectedGroup.tradeDate}
      themeName={selectedThemeName}
      point={selectedPoint}
      groupIndex={navPosition}
      groupCount={navCount}
      viewMode={viewMode}
      isOverride={isOverride}
      onResetOverride={() => setChartOverride(null)}
      headerAvailable={headerAvailable}
      onOpenSettings={() => setSettingsOpen(true)}
      markerMinutes={markerMinutes}
      onMarkerMinutesChange={setMarkerMinutes}
    />
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
          onInput={() => setInputOpen(true)}
          onDelete={handleDeletePoint}
          canDelete={canDeletePoint}
        />
        <PointList
          points={selectedGroup.points}
          selectedPointKey={selectedPoint.pointKey}
          onSelectPoint={commands.selectPoint}
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
      stockCode={selectedGroup.stockCode}
      stockName={selectedGroup.stockName}
      tradeDate={selectedGroup.tradeDate}
      tradeTime={markerTimeStr}
      points={selectedGroup.points}
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
        <section className={styles.singleMode}>
          <MinuteChartPanel
            data={chartPreview.data}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            markerTime={markerTime}
            group={selectedGroup}
            point={selectedPoint}
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
        <section className={styles.singleMode}>
          <DailyChartPanel
            data={chartPreview.data}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            group={selectedGroup}
            point={selectedPoint}
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
      <section className={styles.body}>
        {sidebar}
        <section className={styles.mainPane}>
          <div className={styles.chartCell}>
            <DailyChartPanel
              data={chartPreview.data}
              isLoading={chartPreview.isLoading}
              error={chartPreview.error}
              group={selectedGroup}
              point={selectedPoint}
              priceLines={dailyPriceLines}
            />
          </div>
          <div className={styles.chartCell}>
            <MinuteChartPanel
              data={chartPreview.data}
              isLoading={chartPreview.isLoading}
              error={chartPreview.error}
              markerTime={markerTime}
              group={selectedGroup}
              point={selectedPoint}
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
}: ReviewHeaderProps) {
  const chartPriceMode = useUiStore((state) => state.chartPriceMode);
  const setChartPriceMode = useUiStore((state) => state.setChartPriceMode);
  const headerFieldKeys = useUiStore((state) => state.headerFieldKeys);

  const fieldValues = headerFieldKeys
    .filter((key) => headerAvailable.includes(key))
    .map((key) => ({ key, value: resolveFieldValue(key, point) }));

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
              {groupIndex + 1}/{groupCount}
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
          <div className={styles.segGroup}>
            <button
              className={`${styles.segChip} ${chartPriceMode === "krx" ? styles.segChipActive : ""}`}
              type="button"
              onClick={() => setChartPriceMode("krx")}
            >
              KRX
            </button>
            <button
              className={`${styles.segChip} ${chartPriceMode === "nxt" ? styles.segChipActive : ""}`}
              type="button"
              onClick={() => setChartPriceMode("nxt")}
            >
              NXT
            </button>
          </div>
          <div className={styles.segGroup}>
            {VIEW_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                className={`${styles.segChip} ${viewMode === mode ? styles.segChipActive : ""}`}
                type="button"
                onClick={() => commands.setViewMode(mode)}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.settingsBtn} onClick={onOpenSettings} title="설정">
            ⚙
          </button>
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
  const m = text.trim().match(/(\d{6})\D*(\d{4})\D?(\d{2})\D?(\d{2})/);
  if (!m) return null;
  return { code: m[1], date: `${m[2]}-${m[3]}-${m[4]}` };
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

/** 필드 키(m_xxx 또는 feature 명) → 현재 타점의 값. */
function resolveFieldValue(key: string, point: ReviewPoint): string {
  if (key.startsWith("m_")) {
    return point.sourceRow.manual[key.slice(2)]?.trim() ?? "";
  }
  return point.sourceRow.features[key]?.trim() ?? "";
}

type PointListToolbarProps = {
  onInput: () => void;
  onDelete: () => void;
  canDelete: boolean;
};

function PointListToolbar({ onInput, onDelete, canDelete }: PointListToolbarProps) {
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
        <button type="button" className={styles.pointAddBtn} onClick={onInput}>
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
