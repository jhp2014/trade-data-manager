"use client";

import { useMemo } from "react";
import styles from "./ThemeSidebar.module.css";
import type { ChartThemeOverlay } from "@/types/chart";
import type { ChartPriceMode } from "@/stores/useUiStore";
import { PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK } from "@/lib/constants";
import { RISE_COLOR, FALL_COLOR, NEUTRAL_COLOR, BORDER_SUBTLE_COLOR } from "@/lib/colors";
import { computeThemeMemberMetrics, topByRate, type ThemeMemberMetric } from "@/lib/themeMetrics";
import { formatPercent, truncate } from "@/lib/format";

type ThemeSidebarProps = {
  themes: ChartThemeOverlay[] | undefined;
  markerTime: number | null;
  priceMode: ChartPriceMode;
  selectedThemeId: string | null;
  onSelectTheme: (themeId: string) => void;
  selfStockCode: string;
  onSelectStock: (stockCode: string, stockName: string) => void;
  isLoading: boolean;
  error: Error | null;
};

export function ThemeSidebar({
  themes,
  markerTime,
  priceMode,
  selectedThemeId,
  onSelectTheme,
  selfStockCode,
  onSelectStock,
  isLoading,
  error,
}: ThemeSidebarProps) {
  const activeTheme = useMemo(() => {
    if (!themes || themes.length === 0) return null;
    return themes.find((t) => t.themeId === selectedThemeId) ?? themes[0];
  }, [themes, selectedThemeId]);

  const rows = useMemo(() => {
    if (!activeTheme) return [];
    const metrics = computeThemeMemberMetrics(
      activeTheme.overlaySeries,
      markerTime,
      priceMode,
      PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK,
    );
    return topByRate(metrics, metrics.length);
  }, [activeTheme, markerTime, priceMode]);

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {(themes ?? []).map((theme) => {
          const isActive = theme.themeId === activeTheme?.themeId;
          const name = theme.themeName || theme.themeId;
          return (
            <button
              key={theme.themeId}
              type="button"
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => onSelectTheme(theme.themeId)}
              title={`${name} · ${theme.overlaySeries.length}종목`}
            >
              {truncate(name, 8)}
            </button>
          );
        })}
      </div>

      <div className={styles.body}>
        {isLoading ? (
          <div className={styles.empty}>테마 불러오는 중…</div>
        ) : error ? (
          <div className={styles.empty}>{error.message}</div>
        ) : !activeTheme || rows.length === 0 ? (
          <div className={styles.empty}>테마 데이터 없음</div>
        ) : (
          rows.map((metric, index) => (
            <ThemeRow
              key={metric.stockCode}
              rank={index + 1}
              metric={metric}
              isSelf={metric.stockCode === selfStockCode}
              onSelect={() => onSelectStock(metric.stockCode, metric.stockName)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ThemeRow({
  rank,
  metric,
  isSelf,
  onSelect,
}: {
  rank: number;
  metric: ThemeMemberMetric;
  isSelf: boolean;
  onSelect: () => void;
}) {
  const rateColor =
    metric.rate == null ? NEUTRAL_COLOR : metric.rate > 0 ? RISE_COLOR : metric.rate < 0 ? FALL_COLOR : NEUTRAL_COLOR;

  return (
    <button
      type="button"
      className={`${styles.row} ${isSelf ? styles.rowSelf : ""}`}
      onClick={onSelect}
      title={`${metric.stockName} ${metric.stockCode}`}
    >
      <span className={`${styles.rank} tabular`}>{rank}</span>
      <span className={styles.name}>{truncate(metric.stockName, 7)}</span>
      <AmountCounts distribution={metric.distribution} />
      <span className={`${styles.rate} tabular`} style={{ color: rateColor }}>
        {formatPercent(metric.rate)}
      </span>
      <DayCandle closeRate={metric.rate} dayHighRate={metric.dayHighRate} />
    </button>
  );
}

/** PeerRowAmountCounts 축소판. 최소 임계값 미달이면 빨강 dot 만. */
function AmountCounts({ distribution }: { distribution: Record<number, number> }) {
  const thresholds = PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK;
  const minCount = distribution[thresholds[0]] ?? 0;
  const isActive = minCount > 0;

  return (
    <span className={styles.counts}>
      <span className={`${styles.dot} ${isActive ? styles.dotActive : styles.dotInactive}`} />
      {isActive &&
        thresholds.map((t) => (
          <span key={t} className={styles.countItem}>
            <span className={styles.countThreshold}>{t}</span>
            <span className={`${styles.countValue} tabular`}>{distribution[t] ?? 0}</span>
          </span>
        ))}
    </span>
  );
}

const CANDLE_MIN_PCT = -5;
const CANDLE_MAX_PCT = 30;
const CANDLE_W = 56;
const CANDLE_H = 14;
const CANDLE_PAD = 3;

function pctToX(pct: number): number {
  const clamped = Math.max(CANDLE_MIN_PCT, Math.min(CANDLE_MAX_PCT, pct));
  const ratio = (clamped - CANDLE_MIN_PCT) / (CANDLE_MAX_PCT - CANDLE_MIN_PCT);
  return CANDLE_PAD + ratio * (CANDLE_W - CANDLE_PAD * 2);
}

/** MetricDayCandle 축소판 (스케일 -5%~+30%, 점=현재가, 선=당일 고가). */
function DayCandle({ closeRate, dayHighRate }: { closeRate: number | null; dayHighRate: number | null }) {
  const cy = CANDLE_H / 2;
  const zeroX = pctToX(0);
  const showHigh = dayHighRate !== null && dayHighRate > 0;
  const highX = showHigh ? pctToX(dayHighRate) : zeroX;
  const showClose = closeRate !== null;
  const closeX = showClose ? pctToX(closeRate) : null;
  const closeColor =
    closeRate === null ? "transparent" : closeRate > 0 ? RISE_COLOR : closeRate < 0 ? FALL_COLOR : NEUTRAL_COLOR;

  return (
    <svg
      className={styles.candle}
      width={CANDLE_W}
      height={CANDLE_H}
      viewBox={`0 0 ${CANDLE_W} ${CANDLE_H}`}
      aria-hidden="true"
    >
      <line x1={zeroX} y1={2} x2={zeroX} y2={CANDLE_H - 2} stroke={BORDER_SUBTLE_COLOR} strokeWidth={1} />
      {showHigh && (
        <line x1={zeroX} y1={cy} x2={highX} y2={cy} stroke={RISE_COLOR} strokeWidth={2} strokeLinecap="round" />
      )}
      {showClose && closeX !== null && <circle cx={closeX} cy={cy} r={2.5} fill={closeColor} />}
    </svg>
  );
}
