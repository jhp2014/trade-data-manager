"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./ReviewWorkspace.module.css";
import { RealDailyChart } from "@/components/chart/RealDailyChart";
import { RealMinuteChart } from "@/components/chart/RealMinuteChart";
import { RealThemeOverlayChart } from "@/components/chart/RealThemeOverlayChart";
import { ThemeSidebar } from "./ThemeSidebar";
import { FieldVisibilityPicker } from "./FieldVisibilityPicker";
import { FieldChecklistModal } from "./FieldChecklistModal";
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
import { useReviewStore } from "@/stores/useReviewStore";

type ReviewWorkspaceProps = {
  groups: ReviewStockGroup[];
  initialSelection: InitialReviewSelection;
};

const viewModes: Array<{ mode: ReviewViewMode; label: string }> = [
  { mode: "summary", label: "Summary" },
  { mode: "minute", label: "Minute" },
  { mode: "daily", label: "Daily" },
  { mode: "overlay", label: "Overlay" },
  { mode: "theme", label: "Theme" },
];

const VALUE_TRUNCATE = 15;

export function ReviewWorkspace({ groups, initialSelection }: ReviewWorkspaceProps) {
  const commands = useMemo(() => createReviewCommands(groups), [groups]);
  const storeGroupIndex = useReviewStore((state) => state.selectedGroupIndex);
  const storePointKey = useReviewStore((state) => state.selectedPointKey);
  const viewMode = useReviewStore((state) => state.viewMode);
  const chartOverride = useReviewStore((state) => state.chartOverride);
  const setChartOverride = useReviewStore((state) => state.setChartOverride);
  const hydrateSelection = useReviewStore((state) => state.hydrateSelection);
  const priceMode = useUiStore((state) => state.chartPriceMode);

  useEffect(() => {
    hydrateSelection(initialSelection);
  }, [hydrateSelection, initialSelection]);

  const selectedGroupIndex = storePointKey ? storeGroupIndex : initialSelection.selectedGroupIndex;
  const selectedPointKey = storePointKey ?? initialSelection.selectedPointKey;
  const selectedGroup = groups[selectedGroupIndex] ?? groups[0];
  const selectedPoint =
    selectedGroup.points.find((point) => point.pointKey === selectedPointKey) ??
    selectedGroup.points[0];
  const selectedPointIndex = selectedGroup.points.findIndex(
    (point) => point.pointKey === selectedPoint.pointKey,
  );

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

  // 타점/그룹이 바뀌면 해당 타점 tradeTime 으로 재설정.
  useEffect(() => {
    setMarkerMinutes(timeStringToMinutes(selectedPoint.tradeTime) ?? 540);
  }, [selectedPoint.pointKey, effectiveStock.stockCode]);

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

  const header = (
    <ReviewHeader
      commands={commands}
      displayName={effectiveStock.stockName ?? effectiveStock.stockCode}
      tradeDate={selectedGroup.tradeDate}
      themeName={selectedThemeName}
      point={selectedPoint}
      pointIndex={selectedPointIndex}
      pointCount={selectedGroup.points.length}
      groupIndex={selectedGroupIndex}
      groupCount={groups.length}
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
        <PointListToolbar manualFieldKeys={manualFieldKeys} />
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
      onClose={() => setSettingsOpen(false)}
    />
  );

  if (viewMode === "minute") {
    return (
      <main className={styles.workspace}>
        {header}
        {settingsModal}
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

  if (viewMode === "overlay" || viewMode === "theme") {
    return (
      <main className={styles.workspace}>
        {header}
        {settingsModal}
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
  pointIndex: number;
  pointCount: number;
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
  pointIndex,
  pointCount,
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
          <button type="button" className={styles.settingsBtn} onClick={onOpenSettings} title="설정">
            ⚙
          </button>
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
          <span>row {point.rowNumber}</span>
          <span className={styles.sep}>|</span>
          <span className="tabular">
            Point {formatPointTime(point.tradeTime)} ({pointIndex + 1}/{pointCount})
          </span>
          <span className={styles.sep}>|</span>
          <span className={styles.navGroup} title="Shift+휠로 마커 시간 이동 / 화살표로 종목 이동">
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
      <div className={styles.controls}>
        <TimeSlider minutes={markerMinutes} onMinutesChange={onMarkerMinutesChange} />
        <div className={styles.priceModeTabs}>
          <button
            className={`${styles.modeButton} ${chartPriceMode === "krx" ? styles.modeButtonActive : ""}`}
            type="button"
            onClick={() => setChartPriceMode("krx")}
          >
            KRX
          </button>
          <button
            className={`${styles.modeButton} ${chartPriceMode === "nxt" ? styles.modeButtonActive : ""}`}
            type="button"
            onClick={() => setChartPriceMode("nxt")}
          >
            NXT
          </button>
        </div>
        <div className={styles.modeTabs}>
          {viewModes.map(({ mode, label }) => (
            <button
              key={mode}
              className={`${styles.modeButton} ${viewMode === mode ? styles.modeButtonActive : ""}`}
              type="button"
              onClick={() => commands.setViewMode(mode)}
              title={label}
            >
              {label}
            </button>
          ))}
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

/** 필드 키(m_xxx 또는 feature 명) → 현재 타점의 값. */
function resolveFieldValue(key: string, point: ReviewPoint): string {
  if (key.startsWith("m_")) {
    return point.sourceRow.manual[key.slice(2)]?.trim() ?? "";
  }
  return point.sourceRow.features[key]?.trim() ?? "";
}

function PointListToolbar({ manualFieldKeys }: { manualFieldKeys: string[] }) {
  const pointFieldKeys = useUiStore((state) => state.pointFieldKeys);
  const togglePointField = useUiStore((state) => state.togglePointField);
  const clearPointFields = useUiStore((state) => state.clearPointFields);

  return (
    <div className={styles.pointToolbar}>
      <span className={styles.pointToolbarLabel}>Point List</span>
      <FieldVisibilityPicker
        label="필드"
        availableKeys={manualFieldKeys}
        selectedKeys={pointFieldKeys}
        onToggle={togglePointField}
        onClear={clearPointFields}
      />
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

  return (
    <div className={styles.pointList}>
      {points.map((point) => {
        const isActive = point.pointKey === selectedPointKey;
        const summary = point.manualSummary;
        const fields = pointFieldKeys.map((key) => ({ key, value: resolveFieldValue(key, point) }));

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

// ── Settings Modal ───────────────────────────────────────────

type SettingsModalProps = {
  manualFieldKeys: string[];
  headerAvailable: string[];
  onClose: () => void;
};

function SettingsModal({ manualFieldKeys, headerAvailable, onClose }: SettingsModalProps) {
  const headerFieldKeys = useUiStore((state) => state.headerFieldKeys);
  const toggleHeaderField = useUiStore((state) => state.toggleHeaderField);
  const clearHeaderFields = useUiStore((state) => state.clearHeaderFields);
  const pointFieldKeys = useUiStore((state) => state.pointFieldKeys);
  const togglePointField = useUiStore((state) => state.togglePointField);
  const clearPointFields = useUiStore((state) => state.clearPointFields);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<"header" | "point" | null>(null);

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
            <div className={styles.settingsSectionLabel}>Google Sheet 연결</div>
            <div className={styles.settingsPlaceholder}>추후 Sheet ID · 범위 설정 예정</div>
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
    </div>
  );
}
