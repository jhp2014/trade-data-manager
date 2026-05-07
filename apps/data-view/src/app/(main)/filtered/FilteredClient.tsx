"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { ControlBar } from "@/components/deck/ControlBar";
import { EntryRow } from "@/components/list/EntryRow";
import { EntryListHeader } from "@/components/list/EntryListHeader";
import { EmptyState } from "@/components/deck/EmptyState";
import { FilterChipBar } from "@/components/filter/FilterChipBar";
import { FilterPanel } from "@/components/filter/FilterPanel";
import { ChartModal } from "@/components/chart/ChartModal";
import type { ThemeRowData, LoadedDecksDTO } from "@/types/deck";
import { loadDeckAction } from "@/actions/deck";
import { applyFilters } from "@/lib/filter/applyFilters";
import { sortRows } from "@/lib/sort/sortRows";
import { useFilterState } from "@/hooks/useFilterState";
import { buildOptionRegistry } from "@/lib/options/optionRegistry";
import { useUiStore } from "@/stores/useUiStore";
import styles from "./Filtered.module.css";

interface Props {
    initialSubDir: string;
    initialResult:
        | { ok: true; data: LoadedDecksDTO; rows: ThemeRowData[] }
        | { ok: false; error: string };
}

export function FilteredClient({ initialSubDir, initialResult }: Props) {
    const [result, setResult] = useState(initialResult);
    const [pending, startTransition] = useTransition();
    const [panelOpen, setPanelOpen] = useState(false);

    const [dir, setDir] = useQueryState("dir", parseAsString.withDefault(""));
    const { filter, setFilter, clearFilter, clearOne, activeChips } = useFilterState();
    const initVisibleOptionKeysIfEmpty = useUiStore((s) => s.initVisibleOptionKeysIfEmpty);

    const handleLoad = (subDir: string) => {
        void setDir(subDir);
        startTransition(async () => {
            const res = await loadDeckAction(subDir);
            setResult(res);
        });
    };

    const allRows = useMemo(
        () => (result.ok ? result.rows : []),
        [result],
    );

    const filteredSortedRows = useMemo(
        () => sortRows(applyFilters(allRows, filter)),
        [allRows, filter],
    );

    const optionKeys = result.ok ? result.data.optionKeys : [];
    const allEntries = result.ok ? result.data.entries : [];

    const optionRegistry = useMemo(
        () => buildOptionRegistry(allEntries, optionKeys),
        [allEntries, optionKeys],
    );

    const optionKeysKey = optionKeys.join("|");
    useEffect(() => {
        initVisibleOptionKeysIfEmpty(optionKeys);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionKeysKey, initVisibleOptionKeysIfEmpty]);

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Filtered</h1>
            <p className={styles.subtitle}>
                DECKS_DIR 의 CSV 파일들을 합쳐 시점별 분석을 보여줍니다.
            </p>

            <ControlBar
                initialSubDir={dir || initialSubDir}
                loading={pending}
                summary={
                    result.ok
                        ? {
                            files: result.data.files.length,
                            entries: result.data.entries.length,
                            rows: allRows.length,
                            filteredCount: filteredSortedRows.length,
                            optionKeys: result.data.optionKeys,
                            duplicateCount: result.data.duplicateCount,
                        }
                        : undefined
                }
                onLoad={handleLoad}
            />

            <FilterChipBar
                chips={activeChips}
                onClearOne={clearOne}
                onClearAll={clearFilter}
                panelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen((v) => !v)}
            />

            {panelOpen && (
                <FilterPanel
                    filter={filter}
                    setFilter={setFilter}
                    optionKeys={optionKeys}
                    optionRegistry={optionRegistry}
                />
            )}

            {!result.ok && (
                <EmptyState variant="error" title="덱 로드 실패" body={result.error} />
            )}

            {result.ok && filteredSortedRows.length === 0 && (
                <EmptyState
                    title="entry 없음"
                    body={
                        activeChips.length > 0
                            ? "현재 필터 조건에 맞는 항목이 없습니다."
                            : "이 폴더에는 csv 파일이 없거나 모든 entry가 비어있습니다."
                    }
                />
            )}

            {result.ok && filteredSortedRows.length > 0 && (
                <div className={styles.listArea}>
                    <EntryListHeader
                        optionKeys={optionKeys}
                        optionRegistry={optionRegistry}
                    />
                    <div className={styles.list}>
                        {filteredSortedRows.map((r, idx) => (
                            <EntryRow
                                key={`${r.entry.stockCode}|${r.entry.tradeDate}|${r.entry.tradeTime}|${r.themeId}|${idx}`}
                                row={r}
                                optionKeys={optionKeys}
                            />
                        ))}
                    </div>
                </div>
            )}

            <ChartModal />
        </div>
    );
}
