"use client";

import { useMemo } from "react";
import styles from "./ReviewWorkspace.module.css";
import { RealMinuteChart } from "@/components/chart/RealMinuteChart";
import { RealDailyChart } from "@/components/chart/RealDailyChart";
import { composeUnix } from "@/lib/serialization";
import { formatPointTime } from "@/lib/reviewFields";
import { useChartPreview } from "@/hooks/useChartPreview";
import type { ReviewPoint, ReviewStockGroup } from "@/types/review";
import type { ChartOverlaySeries } from "@/types/chart";

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
  zoomed?: boolean;
  onMoveMarkerToTime?: (timeUnix: number) => void;
  onCyclePoint?: () => void;
};

export function MinuteChartPanel({
  data,
  isLoading,
  error,
  markerTime,
  group,
  point,
  themeOverlay,
  priceLines,
  zoomed,
  onMoveMarkerToTime,
  onCyclePoint,
}: MinuteChartPanelProps) {
  // Point List 타점들의 봉 시각(unix 초). 차트에 ●/거래대금 마커로 표시.
  const pointTimes = useMemo(
    () =>
      group.points
        .map((p) => composeUnix(group.tradeDate, p.tradeTime.slice(0, 5)))
        .filter((t): t is number => t != null),
    [group.points, group.tradeDate],
  );

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
        zoomed={zoomed}
        pointTimes={pointTimes}
        onMoveMarkerToTime={onMoveMarkerToTime}
        onCyclePoint={onCyclePoint}
      />
    </div>
  );
}

type DailyChartPanelProps = ChartPanelProps & {
  priceLines?: Record<string, number[]>;
};

export function DailyChartPanel({ data, isLoading, error, group, point, priceLines }: DailyChartPanelProps) {
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
