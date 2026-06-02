"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./ReviewWorkspace.module.css";
import modalStyles from "./FieldChecklistModal.module.css";
import { RealDailyChart } from "@/components/chart/RealDailyChart";
import { RealMinuteChart } from "@/components/chart/RealMinuteChart";
import { RealThemeOverlayChart } from "@/components/chart/RealThemeOverlayChart";
import { ThemeSidebar } from "./ThemeSidebar";
import { FieldChecklistModal } from "./FieldChecklistModal";
import { ManualFilterModal } from "./ManualFilterModal";
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

type ReviewWorkspaceProps = {
  groups: ReviewStockGroup[];
  initialSelection: InitialReviewSelection;
  manualKeys: ManualKeyDef[];
};

const viewModes: Array<{ mode: ReviewViewMode; label: string }> = [
  { mode: "summary", label: "Summary" },
  { mode: "minute", label: "Minute" },
  { mode: "daily", label: "Daily" },
  { mode: "overlay", label: "Overlay" },
];

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
  const chartPreview = useChartPreview(chartParams);
  const themes = useMemo(() => chartPreview.data?.themes ?? [], [chartPreview.data]);

  // 마커 시간(분 단위). 타점 tradeTime 으로 초기화하되 휠/슬라이더로 조정 가능.
  // tradeTime 이 없으면 09:00(540분) 기본.
  const [markerMinutes, setMarkerMinutes] = useState<number>(
    () => timeStringToMinutes(selectedPoint.tradeTime) ?? 540,
  );

  // 타점(Point)이 바뀔 때만 해당 타점 tradeTime 으로 재설정.
  // 테마 내 다른 종목을 임시 조회(override)할 때는 수동으로 옮긴 마커 시간을 유지한다.
  useEffect(() => {
    setMarkerMinutes(timeStringToMinutes(selectedPoint.tradeTime) ?? 540);
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
      setMarkerMinutes((m) => clampMinutes(e.deltaY > 0 ? m + 1 : m - 1));
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

  // 전역 단축키: a/d=종목, w/s=타점, e/q=뷰 순환, Space=입력 모달.
  // 모달이 열려 있거나 입력 요소에 포커스가 있으면(값 타이핑 중) 무시한다.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (inputOpen || settingsOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      const cycle: ReviewViewMode[] = ["summary", "minute", "daily", "overlay"];
      switch (e.key.toLowerCase()) {
        case "a":
          e.preventDefault();
          commands.prevGroup();
          break;
        case "d":
          e.preventDefault();
          commands.nextGroup();
          break;
        case "w":
          e.preventDefault();
          commands.prevPoint();
          break;
        case "s":
          e.preventDefault();
          commands.nextPoint();
          break;
        case "e": {
          e.preventDefault();
          const cur = cycle.indexOf(viewMode);
          commands.setViewMode(cycle[(cur + 1 + cycle.length) % cycle.length]);
          break;
        }
        case "q": {
          e.preventDefault();
          const cur = cycle.indexOf(viewMode);
          commands.setViewMode(cycle[(cur - 1 + cycle.length) % cycle.length]);
          break;
        }
        case " ":
          e.preventDefault();
          setInputOpen(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commands, viewMode, inputOpen, settingsOpen]);

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

  if (viewMode === "minute") {
    return (
      <main className={styles.workspace}>
        {header}
        {settingsModal}
        {inputDrawer}
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
          <span className={styles.controlSep}>|</span>
          <div className={styles.segTabs}>
            <button
              className={`${styles.segButton} ${chartPriceMode === "krx" ? styles.segButtonActive : ""}`}
              type="button"
              onClick={() => setChartPriceMode("krx")}
            >
              KRX
            </button>
            <button
              className={`${styles.segButton} ${chartPriceMode === "nxt" ? styles.segButtonActive : ""}`}
              type="button"
              onClick={() => setChartPriceMode("nxt")}
            >
              NXT
            </button>
          </div>
          <span className={styles.controlSep}>|</span>
          <div className={styles.segTabs}>
            {viewModes.map(({ mode, label }) => (
              <button
                key={mode}
                className={`${styles.segButton} ${viewMode === mode ? styles.segButtonActive : ""}`}
                type="button"
                onClick={() => commands.setViewMode(mode)}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
          <span className={styles.controlSep}>|</span>
          <button type="button" className={styles.settingsBtn} onClick={onOpenSettings} title="설정">
            ⚙
          </button>
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
    </header>
  );
}

function normalizeTradeTime(tradeTime: string) {
  return tradeTime.length === 5 ? `${tradeTime}:00` : tradeTime;
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
      <div className={styles.segTabs}>
        <button type="button" className={styles.segButton} onClick={onInput}>
          입력
        </button>
        <span className={styles.controlSep}>|</span>
        <button
          type="button"
          className={styles.segButton}
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
        const summary = point.manualSummary;
        const fields = pointFieldKeys.map((key) => ({ key, value: resolveFieldValue(key, point) }));
        const matched = filterActive && pointMatchesManualFilters(point, manualFilters);

        return (
          <button
            key={point.pointKey}
            className={`${styles.pointItem} ${isActive ? styles.pointItemActive : ""}`}
            type="button"
            onClick={() => onSelectPoint(point.pointKey)}
          >
            <div className={styles.pointTop}>
              <span>
                <span className={styles.pointDot}>●</span>{" "}
                <span className="tabular">{formatPointTime(point.tradeTime)}</span>
                {matched && (
                  <span className={styles.pointMatchBadge} title="필터 매칭">
                    필터
                  </span>
                )}
              </span>
              <span className={styles.pointAmount}>
                {point.amountText ?? "-"} | 입력 {summary.filledCount}/{summary.totalCount}
              </span>
            </div>
            {fields.length > 0 && (
              <div className={styles.pointFields}>
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
            )}
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

// ── Sheet 설정 모달 (공용 셸) ──────────────────────────────────

type ReadSheetState = {
  spreadsheetId: string | null;
  tab: string;
  source: "cookie" | "env" | "none";
  hasCredentials: boolean;
};

type SheetDefaults = { spreadsheetId: string; tab: string };

/** 설정 모달 위에 겹쳐 뜨는 액션 모달 셸(읽기/Export/Import 공용). */
function ActionModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };
  return (
    <div ref={overlayRef} className={modalStyles.overlay} onClick={handleOverlayClick}>
      <div className={modalStyles.modal}>
        <div className={modalStyles.header}>
          <span className={modalStyles.title}>{title}</span>
          <button type="button" className={modalStyles.close} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Export 모달 ───────────────────────────────────────────────

type ExportModalProps = {
  filters: Record<string, string[]>;
  activeFilters: number;
  defaults: SheetDefaults;
  onClose: () => void;
};

function ExportModal({ filters, activeFilters, defaults, onClose }: ExportModalProps) {
  const [spreadsheetId, setSpreadsheetId] = useState(defaults.spreadsheetId);
  const [tab, setTab] = useState(defaults.tab);
  const [scope, setScope] = useState<"working" | "all">("working");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId.trim() || undefined,
          tab: tab.trim() || undefined,
          filters,
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export 실패");
      const scopeLabel = data.scope === "all" ? "DB 전체" : "작업셋";
      setStatus({
        ok: true,
        message: `완료: '${data.tab}' 탭에 ${data.rows}행 · ${data.cols}열 (${scopeLabel}${data.filtered ? " · 필터" : ""})`,
      });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionModal title="Google Sheet Export" onClose={onClose}>
      <div className={styles.exportForm}>
        <div className={styles.exportRow}>
          <button
            type="button"
            className={`${styles.button} ${scope === "working" ? styles.buttonActive : ""}`}
            onClick={() => setScope("working")}
          >
            현재 작업셋
          </button>
          <button
            type="button"
            className={`${styles.button} ${scope === "all" ? styles.buttonActive : ""}`}
            onClick={() => setScope("all")}
          >
            DB 전체
          </button>
        </div>
        <input
          className={styles.exportInput}
          type="text"
          placeholder="스프레드시트 ID (비우면 기본값)"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
        />
        <input
          className={styles.exportInput}
          type="text"
          placeholder="탭 이름 (비우면 기본값, 없으면 생성)"
          value={tab}
          onChange={(e) => setTab(e.target.value)}
        />
        <div className={styles.exportHint}>
          {scope === "all"
            ? "DB 전체 타점을 내보냅니다."
            : "현재 작업셋(읽기 시트 범위)의 타점을 내보냅니다."}
          {activeFilters > 0 && ` · m_ 필터 ${activeFilters}개 매칭만`}
        </div>
        <button type="button" className={styles.button} onClick={handleExport} disabled={busy}>
          {busy ? "내보내는 중…" : "Export"}
        </button>
        {status && (
          <div className={status.ok ? styles.exportOk : styles.exportErr}>{status.message}</div>
        )}
      </div>
    </ActionModal>
  );
}

// ── Import (Sheet → DB 병합) 모달 ─────────────────────────────

function ImportModal({ defaults, onClose }: { defaults: SheetDefaults; onClose: () => void }) {
  const router = useRouter();
  const [spreadsheetId, setSpreadsheetId] = useState(defaults.spreadsheetId);
  const [tab, setTab] = useState(defaults.tab);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleImport = async () => {
    if (
      !window.confirm(
        "시트의 비어있지 않은 m_ 값을 DB에 병합합니다.\n(빈 셀은 건드리지 않고, 값이 있는 셀만 덮어씁니다.)\n진행할까요?",
      )
    )
      return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/import-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId.trim() || undefined,
          tab: tab.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import 실패");
      const parts = [`병합 ${data.merged}건`];
      if (data.skippedNotFound > 0) parts.push(`미발견 ${data.skippedNotFound}건`);
      if (data.skippedNoValues > 0) parts.push(`값없음 ${data.skippedNoValues}건`);
      setStatus({ ok: true, message: `완료: ${parts.join(" · ")} (전체 ${data.total}행)` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionModal title="Sheet → DB 병합 Import" onClose={onClose}>
      <div className={styles.exportForm}>
        <div className={styles.exportHint}>
          시트의 m_ 값을 읽어 DB에 병합합니다. 값이 있는 셀만 덮어쓰며 빈 셀은 보존됩니다.
        </div>
        <input
          className={styles.exportInput}
          type="text"
          placeholder="스프레드시트 ID (비우면 읽기 시트 설정)"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
        />
        <input
          className={styles.exportInput}
          type="text"
          placeholder="탭 이름 (비우면 읽기 시트 설정)"
          value={tab}
          onChange={(e) => setTab(e.target.value)}
        />
        <button type="button" className={styles.button} onClick={handleImport} disabled={busy}>
          {busy ? "병합 중…" : "Sheet → DB 병합"}
        </button>
        {status && (
          <div className={status.ok ? styles.exportOk : styles.exportErr}>{status.message}</div>
        )}
      </div>
    </ActionModal>
  );
}

// ── 읽기 시트 모달 ────────────────────────────────────────────

function ReadSheetModal({
  config,
  defaults,
  onClose,
}: {
  config: ReadSheetState | null;
  defaults: SheetDefaults;
  onClose: () => void;
}) {
  const router = useRouter();
  const [spreadsheetId, setSpreadsheetId] = useState(defaults.spreadsheetId);
  const [tab, setTab] = useState(defaults.tab);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const apply = async () => {
    const id = spreadsheetId.trim();
    if (!id) {
      setStatus({ ok: false, message: "스프레드시트 ID 를 입력하세요." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/read-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: id, tab: tab.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "설정 저장 실패");
      setStatus({ ok: true, message: `'${data.tab}' 탭 기준으로 작업셋을 다시 불러옵니다.` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/review/read-sheet", { method: "DELETE" });
      if (!res.ok) throw new Error("초기화 실패");
      setSpreadsheetId("");
      setTab("");
      setStatus({ ok: true, message: "기본값(.env)으로 되돌렸습니다." });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel =
    config?.source === "cookie"
      ? "앱 설정(쿠키)"
      : config?.source === "env"
        ? "기본값(.env)"
        : "미설정 → DB 전체";

  return (
    <ActionModal title="읽기 시트 (작업셋)" onClose={onClose}>
      <div className={styles.exportForm}>
        <div className={styles.exportHint}>
          현재 작업셋: {sourceLabel}
          {config && !config.hasCredentials && " · 서비스 계정 자격증명 없음"}
        </div>
        <input
          className={styles.exportInput}
          type="text"
          placeholder="스프레드시트 ID"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
        />
        <input
          className={styles.exportInput}
          type="text"
          placeholder="탭 이름 (비우면 review)"
          value={tab}
          onChange={(e) => setTab(e.target.value)}
        />
        <div className={styles.exportRow}>
          <button type="button" className={styles.button} onClick={apply} disabled={busy}>
            {busy ? "적용 중…" : "이 시트로 불러오기"}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={reset}
            disabled={busy || config?.source !== "cookie"}
          >
            기본값으로
          </button>
        </div>
        {status && (
          <div className={status.ok ? styles.exportOk : styles.exportErr}>{status.message}</div>
        )}
      </div>
    </ActionModal>
  );
}

// ── Settings Modal ───────────────────────────────────────────

type SettingsModalProps = {
  manualFieldKeys: string[];
  headerAvailable: string[];
  valueSuggestions: Record<string, string[]>;
  onClose: () => void;
};

function SettingsModal({ manualFieldKeys, headerAvailable, valueSuggestions, onClose }: SettingsModalProps) {
  const headerFieldKeys = useUiStore((state) => state.headerFieldKeys);
  const toggleHeaderField = useUiStore((state) => state.toggleHeaderField);
  const clearHeaderFields = useUiStore((state) => state.clearHeaderFields);
  const pointFieldKeys = useUiStore((state) => state.pointFieldKeys);
  const togglePointField = useUiStore((state) => state.togglePointField);
  const clearPointFields = useUiStore((state) => state.clearPointFields);
  const manualFilters = useUiStore((state) => state.manualFilters);
  const toggleManualFilterValue = useUiStore((state) => state.toggleManualFilterValue);
  const clearManualFilters = useUiStore((state) => state.clearManualFilters);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<
    "header" | "point" | "filter" | "read" | "export" | "import" | null
  >(null);
  const [sheetConfig, setSheetConfig] = useState<ReadSheetState | null>(null);
  const activeFilters = activeFilterCount(manualFilters);

  // 읽기 시트 설정(쿠키/env) 불러오기 → 각 모달 입력 기본값으로 사용
  useEffect(() => {
    let alive = true;
    fetch("/api/review/read-sheet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReadSheetState | null) => {
        if (alive && data) setSheetConfig(data);
      })
      .catch(() => {
        /* 무시: 자격증명/설정 없음 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const defaults: SheetDefaults = {
    spreadsheetId: sheetConfig?.spreadsheetId ?? "",
    tab: sheetConfig?.tab ?? "review",
  };

  // 오버레이 클릭(배경)으로 닫기
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div ref={overlayRef} className={styles.settingsOverlay} onClick={handleOverlayClick}>
      <div className={styles.settingsModal}>
        <div className={styles.settingsHeader}>
          <span className={styles.settingsTitle}>설정</span>
          <button type="button" className={styles.settingsClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.settingsBody}>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>헤더 표시 필드</div>
            <button
              type="button"
              className={styles.settingsPickerBtn}
              onClick={() => setOpenPicker("header")}
            >
              <span>헤더 필드 선택</span>
              {headerFieldKeys.length > 0 && (
                <span className={styles.settingsPickerCount}>{headerFieldKeys.length}</span>
              )}
            </button>
          </section>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>Point List 표시 필드</div>
            <button
              type="button"
              className={styles.settingsPickerBtn}
              onClick={() => setOpenPicker("point")}
            >
              <span>포인트 필드 선택</span>
              {pointFieldKeys.length > 0 && (
                <span className={styles.settingsPickerCount}>{pointFieldKeys.length}</span>
              )}
            </button>
          </section>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>m_ 값 필터 (배지 표시)</div>
            <button
              type="button"
              className={styles.settingsPickerBtn}
              onClick={() => setOpenPicker("filter")}
            >
              <span>필터 값 선택</span>
              {activeFilters > 0 && (
                <span className={styles.settingsPickerCount}>{activeFilters}</span>
              )}
            </button>
          </section>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>읽기 시트 (작업셋)</div>
            <button
              type="button"
              className={styles.settingsPickerBtn}
              onClick={() => setOpenPicker("read")}
            >
              <span>읽기 시트 설정</span>
            </button>
          </section>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>Google Sheet Export</div>
            <button
              type="button"
              className={styles.settingsPickerBtn}
              onClick={() => setOpenPicker("export")}
            >
              <span>Sheet로 Export</span>
            </button>
          </section>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionLabel}>Sheet → DB 병합 Import</div>
            <button
              type="button"
              className={styles.settingsPickerBtn}
              onClick={() => setOpenPicker("import")}
            >
              <span>Sheet → DB 병합</span>
            </button>
          </section>
        </div>
      </div>

      {openPicker === "header" && (
        <FieldChecklistModal
          title="헤더 표시 필드"
          availableKeys={headerAvailable}
          selectedKeys={headerFieldKeys}
          onToggle={toggleHeaderField}
          onClear={clearHeaderFields}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "point" && (
        <FieldChecklistModal
          title="Point List 표시 필드"
          availableKeys={manualFieldKeys}
          selectedKeys={pointFieldKeys}
          onToggle={togglePointField}
          onClear={clearPointFields}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "filter" && (
        <ManualFilterModal
          valueSuggestions={valueSuggestions}
          filters={manualFilters}
          onToggle={toggleManualFilterValue}
          onClear={clearManualFilters}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "read" && (
        <ReadSheetModal
          config={sheetConfig}
          defaults={defaults}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "export" && (
        <ExportModal
          filters={manualFilters}
          activeFilters={activeFilters}
          defaults={defaults}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === "import" && (
        <ImportModal defaults={defaults} onClose={() => setOpenPicker(null)} />
      )}
    </div>
  );
}
