"use client";

import { useState, useTransition } from "react";
import { ControlBar } from "@/components/deck/ControlBar";
import { EntryCard } from "@/components/deck/EntryCard";
import { EmptyState } from "@/components/deck/EmptyState";
import type { CardData, LoadedDecksDTO } from "@/types/deck";
import { loadDeckAction } from "@/actions/deck";

interface Props {
  initialSubDir: string;
  initialResult:
    | { ok: true; data: LoadedDecksDTO; cards: CardData[] }
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
    <div
      style={{
        padding: "var(--space-6)",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "var(--fs-3xl)",
          fontWeight: "var(--fw-bold)",
          marginBottom: "var(--space-2)",
        }}
      >
        Filtered
      </h1>
      <p
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-md)",
          marginBottom: "var(--space-5)",
        }}
      >
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
        <EmptyState
          variant="error"
          title="덱 로드 실패"
          body={result.error}
        />
      )}

      {result.ok && result.cards.length === 0 && (
        <EmptyState
          title="entry 없음"
          body={
            "이 폴더에는 csv 파일이 없거나 모든 entry가 비어있습니다.\n" +
            "DECKS_DIR 경로와 하위 폴더를 확인해주세요."
          }
        />
      )}

      {result.ok && result.cards.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {result.cards.map((c) => (
            <EntryCard
              key={`${c.entry.stockCode}|${c.entry.tradeDate}|${c.entry.tradeTime}`}
              data={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
