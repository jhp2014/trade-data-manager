"use client";

import styles from "./ReviewWorkspace.module.css";
import { activeFilterCount, pointMatchesManualFilters } from "@/lib/manualFilter";
import { truncate } from "@/lib/format";
import { VALUE_TRUNCATE, resolveFieldValue, formatPointTime } from "@/lib/reviewFields";
import { useUiStore } from "@/stores/useUiStore";
import type { ReviewPoint } from "@/types/review";

type PointListToolbarProps = {
  onInput: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canInput: boolean;
};

export function PointListToolbar({ onInput, onDelete, canDelete, canInput }: PointListToolbarProps) {
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

export function PointList({ points, selectedPointKey, onSelectPoint }: PointListProps) {
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
