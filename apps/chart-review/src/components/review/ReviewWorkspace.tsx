"use client";

import { useEffect, useMemo } from "react";
import styles from "./ReviewWorkspace.module.css";
import { RealDailyChart } from "@/components/chart/RealDailyChart";
import { RealMinuteChart } from "@/components/chart/RealMinuteChart";
import { createReviewCommands } from "@/lib/reviewCommands";
import { composeUnix } from "@/lib/serialization";
import { useChartPreview } from "@/hooks/useChartPreview";
import { useUiStore } from "@/stores/useUiStore";
import type {
  InitialReviewSelection,
  ReviewPoint,
  ReviewStockGroup,
  ReviewViewMode,
} from "@/types/review";
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

export function ReviewWorkspace({ groups, initialSelection }: ReviewWorkspaceProps) {
  const commands = useMemo(() => createReviewCommands(groups), [groups]);
  const storeGroupIndex = useReviewStore((state) => state.selectedGroupIndex);
  const storePointKey = useReviewStore((state) => state.selectedPointKey);
  const viewMode = useReviewStore((state) => state.viewMode);
  const hydrateSelection = useReviewStore((state) => state.hydrateSelection);

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
  const chartParams = useMemo(
    () => ({ stockCode: selectedGroup.stockCode, tradeDate: selectedGroup.tradeDate }),
    [selectedGroup.stockCode, selectedGroup.tradeDate],
  );
  const chartPreview = useChartPreview(chartParams);
  const markerTime = useMemo(
    () => composeUnix(selectedGroup.tradeDate, normalizeTradeTime(selectedPoint.tradeTime)),
    [selectedGroup.tradeDate, selectedPoint.tradeTime],
  );

  if (viewMode === "minute") {
    return (
      <main className={styles.workspace}>
        <ReviewHeader
          commands={commands}
          group={selectedGroup}
          groupIndex={selectedGroupIndex}
          groupCount={groups.length}
          point={selectedPoint}
          pointIndex={selectedPointIndex}
          viewMode={viewMode}
        />
        <section className={styles.singleMode}>
          <FeatureStrip point={selectedPoint} />
          <MinuteChartPanel
            data={chartPreview.data}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            markerTime={markerTime}
            group={selectedGroup}
            point={selectedPoint}
          />
        </section>
      </main>
    );
  }

  if (viewMode === "daily") {
    return (
      <main className={styles.workspace}>
        <ReviewHeader
          commands={commands}
          group={selectedGroup}
          groupIndex={selectedGroupIndex}
          groupCount={groups.length}
          point={selectedPoint}
          pointIndex={selectedPointIndex}
          viewMode={viewMode}
        />
        <section className={styles.singleMode}>
          <FeatureStrip point={selectedPoint} />
          <DailyChartPanel
            data={chartPreview.data}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            group={selectedGroup}
            point={selectedPoint}
          />
        </section>
      </main>
    );
  }

  if (viewMode === "overlay" || viewMode === "theme") {
    return (
      <main className={styles.workspace}>
        <ReviewHeader
          commands={commands}
          group={selectedGroup}
          groupIndex={selectedGroupIndex}
          groupCount={groups.length}
          point={selectedPoint}
          pointIndex={selectedPointIndex}
          viewMode={viewMode}
        />
        <section className={styles.singleMode}>
          <ChartPlaceholder
            kind={viewMode === "overlay" ? "Overlay Placeholder" : "Theme Placeholder"}
            group={selectedGroup}
            point={selectedPoint}
          />
        </section>
      </main>
    );
  }

  return (
    <main className={styles.workspace}>
      <ReviewHeader
        commands={commands}
        group={selectedGroup}
        groupIndex={selectedGroupIndex}
        groupCount={groups.length}
        point={selectedPoint}
        pointIndex={selectedPointIndex}
        viewMode={viewMode}
      />
      <section className={styles.body}>
        <aside className={styles.leftPane}>
          <div className={styles.dailySlot}>
            <DailyChartPanel
              data={chartPreview.data}
              isLoading={chartPreview.isLoading}
              error={chartPreview.error}
              group={selectedGroup}
              point={selectedPoint}
            />
          </div>
          <PointList
            points={selectedGroup.points}
            selectedPointKey={selectedPoint.pointKey}
            onSelectPoint={commands.selectPoint}
          />
        </aside>
        <section className={styles.rightPane}>
          <FeatureStrip point={selectedPoint} />
          <MinuteChartPanel
            data={chartPreview.data}
            isLoading={chartPreview.isLoading}
            error={chartPreview.error}
            markerTime={markerTime}
            group={selectedGroup}
            point={selectedPoint}
          />
        </section>
      </section>
    </main>
  );
}

type ReviewHeaderProps = {
  commands: ReturnType<typeof createReviewCommands>;
  group: ReviewStockGroup;
  groupIndex: number;
  groupCount: number;
  point: ReviewPoint;
  pointIndex: number;
  viewMode: ReviewViewMode;
};

function ReviewHeader({
  commands,
  group,
  groupIndex,
  groupCount,
  point,
  pointIndex,
  viewMode,
}: ReviewHeaderProps) {
  const filled = point.manualSummary.filledCount;
  const total = point.manualSummary.totalCount;
  const chartPriceMode = useUiStore((state) => state.chartPriceMode);
  const setChartPriceMode = useUiStore((state) => state.setChartPriceMode);

  return (
    <header className={styles.header}>
      <div>
        <div className={styles.titleLine}>
          <span className={styles.stockName}>{group.stockName ?? group.stockCode}</span>
          <span className="tabular">{group.stockCode}</span>
          <span>|</span>
          <span className="tabular">{group.tradeDate}</span>
          <span>|</span>
          <span className="tabular">
            Point {point.tradeTime} ({pointIndex + 1}/{group.points.length})
          </span>
          <span>|</span>
          <span>
            Group {groupIndex + 1}/{groupCount}
          </span>
          <span>|</span>
          <span>
            입력 {filled}/{total}
          </span>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.pill}>{point.sourceRow.themeName ?? "대표 테마 없음"}</span>
          <span className={styles.pill}>row {point.rowNumber}</span>
          <span className={styles.pill}>{point.reviewId}</span>
        </div>
      </div>
      <div className={styles.controls}>
        <button
          className={styles.button}
          type="button"
          onClick={commands.prevGroup}
          disabled={groupIndex === 0}
        >
          Prev Stock
        </button>
        <button
          className={styles.button}
          type="button"
          onClick={commands.nextGroup}
          disabled={groupIndex === groupCount - 1}
        >
          Next Stock
        </button>
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
              title={mode === "overlay" || mode === "theme" ? `${label} placeholder` : label}
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

type PointListProps = {
  points: ReviewPoint[];
  selectedPointKey: string;
  onSelectPoint: (pointKey: string) => void;
};

function PointList({ points, selectedPointKey, onSelectPoint }: PointListProps) {
  return (
    <div className={styles.pointList}>
      {points.map((point) => {
        const isActive = point.pointKey === selectedPointKey;
        const summary = point.manualSummary;

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
                <span className="tabular">{point.tradeTime}</span>
              </span>
              <span className={styles.pointAmount}>
                {point.amountText ?? "-"} | 입력 {summary.filledCount}/{summary.totalCount}
              </span>
            </div>
            <div className={styles.pointManual}>
              <div className={styles.manualPreview}>
                {Object.entries(summary.preview).map(([key, value]) => (
                  <span key={key} className={value ? styles.filled : styles.missing}>
                    {key} {value ? "O" : "-"}
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FeatureStrip({ point }: { point: ReviewPoint }) {
  const featureEntries = Object.entries(point.sourceRow.features).filter(
    ([key]) => key !== "amountText",
  );

  return (
    <div className={styles.featureStrip}>
      {featureEntries.map(([key, value]) => (
        <div key={key} className={styles.feature}>
          <div className={styles.featureLabel}>{key}</div>
          <div className={styles.featureValue}>{value}</div>
        </div>
      ))}
      <div className={styles.feature}>
        <div className={styles.featureLabel}>amountText</div>
        <div className={styles.featureValue}>{point.amountText ?? "-"}</div>
      </div>
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
};

function MinuteChartPanel({
  data,
  isLoading,
  error,
  markerTime,
  group,
  point,
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
        themeOverlay={[]}
        prevCloseKrx={data.prevCloseKrx}
        prevCloseNxt={data.prevCloseNxt}
      />
    </div>
  );
}

function DailyChartPanel({ data, isLoading, error, group, point }: ChartPanelProps) {
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
      <RealDailyChart candles={data.daily} />
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
            {group.stockName ?? group.stockCode} {group.tradeDate} {point.tradeTime}
          </div>
        </div>
        <div className={styles.placeholderSub}>
          {message ?? "This view remains a placeholder in the current phase."}
        </div>
      </div>
    </div>
  );
}
