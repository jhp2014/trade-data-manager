"use client";

import { useState, useTransition } from "react";
import { ControlBar } from "@/components/deck/ControlBar";
import { EntryRow } from "@/components/list/EntryRow";
import { EmptyState } from "@/components/deck/EmptyState";
import type { ThemeRowData, LoadedDecksDTO } from "@/types/deck";
import { loadDeckAction } from "@/actions/deck";
import styles from "./Filtered.module.css";
import { ChartModal } from "@/components/chart/ChartModal";

interface Props {
  initialSubDir: string;
  initialResult:
  | { ok: true; data: LoadedDecksDTO; rows: ThemeRowData[] }
  | { ok: false; error: string };
}

export function FilteredClient({ initialSubDir, initialResult }: Props) {
  const [result, setResult] = useState(initialResult);
  const [pending, startTransition] = useTransition();

  const handleLoad = (subDir: string) => {
    startTransition(async () => {
      const res = await loadDeckAction(subDir);
      setResult(res);
    });
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Filtered</h1>
      <p className={styles.subtitle}>
        DECKS_DIR 의 CSV 파일들을 합쳐 시점별 분석을 보여줍니다.
      </p>

      <ControlBar
        initialSubDir={initialSubDir}
        loading={pending}
        summary={
          result.ok
            ? {
              files: result.data.files.length,
              entries: result.data.entries.length,
              optionKeys: result.data.optionKeys,
              duplicateCount: result.data.duplicateCount,
            }
            : undefined
        }
        onLoad={handleLoad}
      />

      {!result.ok && (
        <EmptyState variant="error" title="덱 로드 실패" body={result.error} />
      )}

      {result.ok && result.rows.length === 0 && (
        <EmptyState
          title="entry 없음"
          body={"이 폴더에는 csv 파일이 없거나 모든 entry가 비어있습니다."}
        />
      )}

      {result.ok && result.rows.length > 0 && (
        <div className={styles.list}>
          {result.rows.map((r, idx) => (
            <EntryRow
              key={`${r.entry.stockCode}|${r.entry.tradeDate}|${r.entry.tradeTime}|${r.themeId}|${idx}`}
              row={r}
            />
          ))}
        </div>
      )}

      <ChartModal />
    </div>
  );
}
