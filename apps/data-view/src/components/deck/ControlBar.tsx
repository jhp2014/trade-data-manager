"use client";

import { useState } from "react";
import styles from "./ControlBar.module.css";

interface Props {
  initialSubDir?: string;
  loading: boolean;
  summary?: {
    files: number;
    entries: number;
    rows: number;
    filteredCount: number;
    optionKeys: string[];
    duplicateCount: number;
  };
  onLoad: (subDir: string) => void;
}

export function ControlBar({
  initialSubDir = "",
  loading,
  summary,
  onLoad,
}: Props) {
  const [subDir, setSubDir] = useState(initialSubDir);

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.label}>하위 폴더:</span>
        <input
          className={styles.subDirInput}
          placeholder="예: 2026-04 (비우면 최상위)"
          value={subDir}
          onChange={(e) => setSubDir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onLoad(subDir);
          }}
          disabled={loading}
        />
        <button
          type="button"
          className={styles.loadBtn}
          onClick={() => onLoad(subDir)}
          disabled={loading}
        >
          {loading ? "로딩…" : "불러오기"}
        </button>
      </div>

      {summary && (
        <div className={styles.summary}>
          <span className={styles.summaryItem}>
            파일 <b className={styles.summaryNum}>{summary.files}</b>
          </span>
          <span className={styles.summaryItem}>
            entries <b className={styles.summaryNum}>{summary.entries}</b>
          </span>
          <span className={styles.summaryItem}>
            rows <b className={styles.summaryNum}>{summary.rows}</b>
            {summary.filteredCount < summary.rows && (
              <span> → <b className={styles.summaryNum}>{summary.filteredCount}</b></span>
            )}
          </span>
          {summary.duplicateCount > 0 && (
            <span className={styles.summaryItem}>
              중복제거{" "}
              <b className={styles.summaryNum}>{summary.duplicateCount}</b>
            </span>
          )}
          {summary.optionKeys.length > 0 && (
            <span className={styles.summaryItem}>
              옵션 [{summary.optionKeys.join(", ")}]
            </span>
          )}
        </div>
      )}
    </div>
  );
}
