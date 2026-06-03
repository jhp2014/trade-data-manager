"use client";

import { useEffect, useRef } from "react";
import styles from "./HistorySwitcher.module.css";
import type { HistoryEntry } from "@/stores/useReviewStore";

type HistorySwitcherProps = {
  entries: HistoryEntry[];
  activeIndex: number;
  /** 현재 보고 있는 그룹 키("code-date"). 일치 항목에 "현재" 배지. */
  currentKey: string;
  /** 항목을 직접 선택(클릭). */
  onPick: (index: number) => void;
};

/**
 * Tab 히스토리 스위처 모달.
 * 이동/확정은 부모(ReviewWorkspace)가 관리하고,
 * 이 컴포넌트는 현재 목록과 활성 항목만 표시한다.
 */
export function HistorySwitcher({ entries, activeIndex, currentKey, onPick }: HistorySwitcherProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // 활성 항목이 보이도록 스크롤.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} role="dialog" aria-label="탐색 히스토리">
        <div className={styles.head}>
          <span className={styles.title}>탐색 히스토리</span>
          <span className={styles.hint}>
            <kbd className={styles.kbd}>Tab</kbd>
            <kbd className={styles.kbd}>w</kbd>
            <kbd className={styles.kbd}>s</kbd> 이동 ·{" "}
            <kbd className={styles.kbd}>Space</kbd> 선택 ·{" "}
            <kbd className={styles.kbd}>Esc</kbd> 취소
          </span>
        </div>
        <div className={styles.list}>
          {entries.map((entry, index) => {
            const isActive = index === activeIndex;
            const key = `${entry.stockCode}-${entry.tradeDate}`;
            return (
              <button
                key={key}
                ref={isActive ? activeRef : null}
                type="button"
                className={`${styles.row} ${isActive ? styles.rowActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(index);
                }}
              >
                {entry.hasReview && (
                  <span className={styles.reviewDot} title="Point List 있음" aria-hidden="true" />
                )}
                <span className={styles.name}>{entry.stockName || entry.stockCode}</span>
                <span className={`${styles.date} tabular`}>{formatDate(entry.tradeDate)}</span>
                {key === currentKey && <span className={styles.cur}>현재</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** "2026-05-27" → "26.05.27". 형식이 다르면 원본 그대로. */
function formatDate(tradeDate: string): string {
  const m = tradeDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return tradeDate;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}
